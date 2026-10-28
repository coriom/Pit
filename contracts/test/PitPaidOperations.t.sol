// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PitPaidOperations} from "../src/PitPaidOperations.sol";
import {PitPaidBase} from "../src/PitPaidBase.sol";
import {PitPaidTokenCreator} from "../src/PitPaidTokenCreator.sol";
import {PitMockUSDC} from "../src/PitMockUSDC.sol";
import {PitStandardToken, PitAdvancedToken} from "../src/PitTokens.sol";
import {PitTokenLock, PitTokenVesting} from "../src/PitSchedules.sol";

interface VmPaid {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function chainId(uint256) external;
}

contract TaxedAsset is ERC20 {
    constructor() ERC20("Taxed", "TAX") { _mint(msg.sender, 1000); }
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) { super._update(from, address(0xdead), 1); amount -= 1; }
        super._update(from, to, amount);
    }
}

contract TaxedPayment6 is ERC20 {
    constructor(address recipient) ERC20("Taxed local payment", "TAX6") { _mint(recipient, 1_000_000_000); }
    function decimals() public pure override returns (uint8) { return 6; }
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) { super._update(from, address(0xdead), 1); amount -= 1; }
        super._update(from, to, amount);
    }
}

contract ReentrantPayment6 is ERC20 {
    PitPaidTokenCreator public target;
    bool private inside;
    bool public nestedSucceeded;
    constructor(address recipient) ERC20("Reentrant local payment", "REENT6") {
        _mint(recipient, 1_000_000_000);
        _mint(address(this), 49e6);
    }
    function decimals() public pure override returns (uint8) { return 6; }
    function setTarget(PitPaidTokenCreator next) external {
        require(address(target) == address(0), "already configured");
        target = next;
        _approve(address(this), address(next), 49e6);
    }
    function _update(address from, address to, uint256 amount) internal override {
        if (!inside && from != address(0) && to == address(0xFEE) && address(target) != address(0)) {
            inside = true;
            PitPaidBase.Quote memory nested = PitPaidBase.Quote(bytes32(uint256(999)), 1, 49e6, uint64(block.timestamp + 100));
            try target.createStandard("Nested", "NST", 1, address(this), nested) { nestedSucceeded = true; } catch {}
            inside = false;
        }
        super._update(from, to, amount);
    }
}

contract PitPaidOperationsTest {
    VmPaid constant vm = VmPaid(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant MERCHANT = address(0xFEE);
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    PitMockUSDC internal usdc;
    PitStandardToken internal asset;
    PitPaidOperations internal paid;
    PitPaidTokenCreator internal creator;

    function prices() internal pure returns (PitPaidBase.Prices memory p) {
        p = PitPaidBase.Prices(49e6, 149e6, 3e6, 100_000, 49e6, 39e6, 79e6);
    }
    function setUp() public {
        vm.warp(1000);
        usdc = new PitMockUSDC(address(this));
        asset = new PitStandardToken("Test Asset", "TEST", 10_000 ether, address(this));
        paid = new PitPaidOperations(usdc, MERCHANT, address(this), prices());
        creator = new PitPaidTokenCreator(usdc, MERCHANT, address(this), prices());
        usdc.approve(address(paid), type(uint256).max);
        usdc.approve(address(creator), type(uint256).max);
        asset.approve(address(paid), type(uint256).max);
    }
    function id(uint256 n) internal pure returns (bytes32) { return bytes32(n); }
    function deadline() internal pure returns (uint64) { return 1100; }
    function quote(uint256 n, uint256 version, uint256 maxFee) internal pure returns (PitPaidBase.Quote memory) {
        return PitPaidBase.Quote(id(n), version, maxFee, deadline());
    }
    function assertEq(uint256 a, uint256 b) internal pure { require(a == b, "amount mismatch"); }

    function testStandardFeeOwnershipAndReplay() public {
        uint256 beforePayer = usdc.balanceOf(address(this));
        address tokenAddress = creator.createStandard("New", "NEW", 100 ether, ALICE, quote(1, 1, 49e6));
        PitStandardToken token = PitStandardToken(tokenAddress);
        assertEq(usdc.balanceOf(MERCHANT), 49e6);
        assertEq(beforePayer - usdc.balanceOf(address(this)), 49e6);
        assertEq(token.totalSupply(), 100 ether);
        assertEq(token.balanceOf(ALICE), 100 ether);
        require(creator.usedIntent(address(this), id(1)), "intent not consumed");
        vm.expectRevert(); creator.createStandard("New", "NEW", 100 ether, ALICE, quote(1, 1, 49e6));
        assertEq(usdc.balanceOf(MERCHANT), 49e6);
        creator.createStandard("New", "NEW", 100 ether, ALICE, quote(2, 1, 49e6));
        assertEq(usdc.balanceOf(MERCHANT), 98e6);
    }

    function testAdvancedCreatorOwnsRolesNotRouter() public {
        PitPaidTokenCreator.AdvancedConfig memory config = PitPaidTokenCreator.AdvancedConfig("Advanced", "ADV", 10 ether, 20 ether, ALICE, true, true, true);
        address tokenAddress = creator.createAdvanced(config, quote(1, 1, 149e6));
        PitAdvancedToken token = PitAdvancedToken(tokenAddress);
        require(token.hasRole(token.DEFAULT_ADMIN_ROLE(), address(this)), "creator lacks admin");
        require(token.hasRole(token.MINTER_ROLE(), address(this)), "creator lacks mint");
        require(!token.hasRole(token.DEFAULT_ADMIN_ROLE(), address(creator)), "router has admin");
        require(!token.hasRole(token.MINTER_ROLE(), address(creator)), "router has mint");
        assertEq(usdc.balanceOf(MERCHANT), 149e6);
    }

    function testMultiSendChargesExactFeeAndConserves() public {
        address[] memory recipients = new address[](2); recipients[0] = ALICE; recipients[1] = BOB;
        uint256[] memory amounts = new uint256[](2); amounts[0] = 7 ether; amounts[1] = 3 ether;
        uint256 beforeAsset = asset.balanceOf(address(this));
        assertEq(paid.multiSend(asset, recipients, amounts, quote(1, 1, 3_200_000)), 10 ether);
        assertEq(usdc.balanceOf(MERCHANT), 3_200_000);
        assertEq(asset.balanceOf(ALICE), 7 ether);
        assertEq(asset.balanceOf(BOB), 3 ether);
        assertEq(beforeAsset - asset.balanceOf(address(this)), 10 ether);
        assertEq(asset.balanceOf(address(paid)), 0);
        assertEq(asset.allowance(address(this), address(paid)), type(uint256).max);
    }

    function testLockAndVestingFundAtomicallyAndClaimForFree() public {
        address lockAddress = paid.createLock(asset, 30 ether, ALICE, 1200, quote(1, 1, 39e6));
        PitTokenLock lock = PitTokenLock(lockAddress);
        require(lock.beneficiary() == ALICE, "wrong lock beneficiary");
        assertEq(lock.deposited(), 30 ether);
        assertEq(asset.balanceOf(address(paid)), 0);
        PitPaidOperations.VestingConfig memory config = PitPaidOperations.VestingConfig(asset, 100 ether, BOB, 1100, 100, 1150);
        address vestAddress = paid.createVesting(config, quote(2, 1, 79e6));
        PitTokenVesting vest = PitTokenVesting(vestAddress);
        require(vest.beneficiary() == BOB && vest.funded(), "wrong vesting beneficiary or funding");
        assertEq(asset.balanceOf(address(paid)), 0);
        assertEq(usdc.balanceOf(MERCHANT), 118e6);
        vm.warp(1150);
        vm.prank(BOB); vest.release();
        assertEq(asset.balanceOf(BOB), 50 ether);
        vm.warp(1200);
        vm.prank(ALICE); lock.release();
        vm.prank(BOB); vest.release();
        assertEq(asset.balanceOf(ALICE), 30 ether);
        assertEq(asset.balanceOf(BOB), 100 ether);
        assertEq(usdc.balanceOf(MERCHANT), 118e6);
    }

    function testQuoteExpiryVersionFeeCapAndFailureRollback() public {
        vm.expectRevert(); creator.createStandard("A", "A", 1, ALICE, quote(1, 1, 48e6));
        vm.expectRevert(); creator.createStandard("", "A", 1, ALICE, quote(1, 1, 49e6));
        assertEq(usdc.balanceOf(MERCHANT), 0);
        require(!creator.usedIntent(address(this), id(1)), "failed intent consumed");
        vm.warp(1101);
        vm.expectRevert(); creator.createStandard("A", "A", 1, ALICE, quote(1, 1, 49e6));
        vm.warp(1000);
        PitPaidBase.Prices memory next = prices(); next.standard = 50e6;
        creator.setPrices(next);
        vm.expectRevert(); creator.createStandard("A", "A", 1, ALICE, quote(1, 1, 49e6));
        vm.expectRevert(); creator.createStandard("A", "A", 1, ALICE, quote(1, 2, 49e6));
        creator.createStandard("A", "A", 1, ALICE, quote(1, 2, 50e6));
        assertEq(usdc.balanceOf(MERCHANT), 50e6);
    }

    function testWrongPayerMissingAllowanceAndTaxedAssetRollback() public {
        vm.prank(BOB); vm.expectRevert(); creator.createStandard("A", "A", 1, BOB, quote(3, 1, 49e6));
        assertEq(usdc.balanceOf(MERCHANT), 0);
        address[] memory recipients = new address[](1); recipients[0] = ALICE;
        uint256[] memory amounts = new uint256[](1); amounts[0] = 10;
        asset.approve(address(paid), 0);
        vm.expectRevert(); paid.multiSend(asset, recipients, amounts, quote(4, 1, 3_100_000));
        assertEq(usdc.balanceOf(MERCHANT), 0);
        require(!paid.usedIntent(address(this), id(4)), "failed batch consumed intent");
        TaxedAsset taxed = new TaxedAsset(); taxed.approve(address(paid), 10);
        vm.expectRevert(); paid.multiSend(taxed, recipients, amounts, quote(5, 1, 3_100_000));
        assertEq(usdc.balanceOf(MERCHANT), 0);
        require(!paid.usedIntent(address(this), id(5)), "taxed batch consumed intent");
    }

    function testUnauthorizedPriceUpdateAndFeeCap() public {
        PitPaidBase.Prices memory next = prices(); next.multiCap = 4e6;
        vm.prank(ALICE); vm.expectRevert(); paid.setPrices(next);
        paid.setPrices(next);
        assertEq(paid.multiFee(100), 4e6);
        vm.expectRevert(); paid.multiFee(101);
        next.multiCap = 2e6;
        vm.expectRevert(); paid.setPrices(next);
    }

    function testFuzzMultiFeeIsBounded(uint8 count, uint32 base, uint32 per, uint32 capSeed) public {
        uint256 n = uint256(count) % 100 + 1;
        PitPaidBase.Prices memory next = prices();
        next.multiBase = uint256(base) % 500_000_000 + 1;
        next.multiPerRecipient = uint256(per) % 1_000_000 + 1;
        next.multiCap = next.multiBase + uint256(capSeed) % 500_000_000;
        paid.setPrices(next);
        uint256 actual = paid.multiFee(n);
        require(actual >= next.multiBase && actual <= next.multiCap, "fee outside schedule");
        require(actual <= next.multiBase + next.multiPerRecipient * n, "fee exceeded linear amount");
    }

    function testWrongPayerCannotSpendAnotherAllowance() public {
        usdc.transfer(BOB, 49e6);
        vm.prank(BOB); usdc.approve(address(creator), 49e6);
        uint256 originalBalance = usdc.balanceOf(address(this));
        vm.prank(BOB);
        address tokenAddress = creator.createStandard("Owned", "OWN", 1 ether, BOB, quote(10, 1, 49e6));
        assertEq(usdc.balanceOf(address(this)), originalBalance);
        assertEq(usdc.balanceOf(BOB), 0);
        assertEq(PitStandardToken(tokenAddress).balanceOf(BOB), 1 ether);
        require(creator.usedIntent(BOB, id(10)) && !creator.usedIntent(address(this), id(10)), "wrong payer intent");
    }

    function testInvalidAssetParametersRollbackFee() public {
        address[] memory recipients = new address[](2); recipients[0] = ALICE; recipients[1] = ALICE;
        uint256[] memory amounts = new uint256[](2); amounts[0] = 1; amounts[1] = 1;
        vm.expectRevert(); paid.multiSend(asset, recipients, amounts, quote(20, 1, 3_200_000));
        vm.expectRevert(); paid.createLock(asset, 1 ether, address(0), 1200, quote(21, 1, 39e6));
        PitPaidOperations.VestingConfig memory invalid = PitPaidOperations.VestingConfig(asset, 1 ether, ALICE, 1100, 100, 1201);
        vm.expectRevert(); paid.createVesting(invalid, quote(22, 1, 79e6));
        assertEq(usdc.balanceOf(MERCHANT), 0);
        require(!paid.usedIntent(address(this), id(20)) && !paid.usedIntent(address(this), id(21)) && !paid.usedIntent(address(this), id(22)), "failed intent used");
    }

    function testTaxedPaymentTokenCannotCollectFee() public {
        TaxedPayment6 payment = new TaxedPayment6(address(this));
        PitPaidTokenCreator taxedCreator = new PitPaidTokenCreator(payment, MERCHANT, address(this), prices());
        payment.approve(address(taxedCreator), 49e6);
        vm.expectRevert(); taxedCreator.createStandard("A", "A", 1, ALICE, quote(30, 1, 49e6));
        assertEq(payment.balanceOf(MERCHANT), 0);
        require(!taxedCreator.usedIntent(address(this), id(30)), "taxed fee intent used");
    }

    function testReentrantPaymentCallbackCannotDoubleChargeOrCreate() public {
        ReentrantPayment6 payment = new ReentrantPayment6(address(this));
        PitPaidTokenCreator protectedCreator = new PitPaidTokenCreator(payment, MERCHANT, address(this), prices());
        payment.setTarget(protectedCreator);
        payment.approve(address(protectedCreator), 49e6);
        address tokenAddress = protectedCreator.createStandard("Outer", "OUT", 1, ALICE, quote(31, 1, 49e6));
        assertEq(PitStandardToken(tokenAddress).balanceOf(ALICE), 1);
        assertEq(payment.balanceOf(MERCHANT), 49e6);
        require(!payment.nestedSucceeded(), "nested operation succeeded");
        require(!protectedCreator.usedIntent(address(payment), bytes32(uint256(999))), "nested intent consumed");
    }

    function testWrongDecimalsAndFeeRecipientRejected() public {
        vm.expectRevert(); new PitPaidTokenCreator(asset, MERCHANT, address(this), prices());
        vm.expectRevert(); new PitPaidTokenCreator(usdc, address(0), address(this), prices());
    }

    function testMockPaymentAssetRejectsOtherChains() public {
        vm.chainId(84532);
        vm.expectRevert(); new PitMockUSDC(address(this));
    }

    function testFuzzPaidBatchConservesBalances(uint96 first, uint96 second) public {
        uint256 a = uint256(first) % 1000 ether + 1;
        uint256 b = uint256(second) % 1000 ether + 1;
        address[] memory recipients = new address[](2); recipients[0] = ALICE; recipients[1] = BOB;
        uint256[] memory amounts = new uint256[](2); amounts[0] = a; amounts[1] = b;
        uint256 initial = asset.balanceOf(address(this));
        assertEq(paid.multiSend(asset, recipients, amounts, quote(40, 1, 3_200_000)), a + b);
        assertEq(asset.balanceOf(ALICE), a);
        assertEq(asset.balanceOf(BOB), b);
        assertEq(asset.balanceOf(address(this)), initial - a - b);
        assertEq(usdc.balanceOf(MERCHANT), 3_200_000);
        assertEq(asset.balanceOf(address(paid)), 0);
    }
}
