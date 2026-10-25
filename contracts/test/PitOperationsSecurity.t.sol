// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PitStandardToken, PitAdvancedToken, PitTokenFactory} from "../src/PitTokens.sol";
import {PitMultiSender} from "../src/PitMultiSender.sol";
import {PitTokenLock, PitTokenVesting} from "../src/PitSchedules.sol";

interface VmSecurity {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert() external;
}

contract FalseTransferToken is ERC20 {
    constructor() ERC20("False", "FALSE") { _mint(msg.sender, 100); }
    function transferFrom(address, address, uint256) public pure override returns (bool) { return false; }
}

contract RevertingTransferToken is ERC20 {
    constructor() ERC20("Revert", "REVERT") { _mint(msg.sender, 100); }
    function transferFrom(address, address, uint256) public pure override returns (bool) { revert("blocked"); }
}

contract SixDecimalToken is ERC20 {
    constructor() ERC20("Six", "SIX") { _mint(msg.sender, 1_000_000); }
    function decimals() public pure override returns (uint8) { return 6; }
}

contract TaxedFundingToken is ERC20 {
    constructor() ERC20("Taxed", "TAX") { _mint(msg.sender, 100); }
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0), 1);
            amount -= 1;
        }
        super._update(from, to, amount);
    }
}

contract EmptyReturnToken {
    fallback() external { assembly { return(0, 0) } }
}

contract FactoryContractCaller {
    function create(PitTokenFactory factory) external returns (PitAdvancedToken) {
        return PitAdvancedToken(factory.createAdvanced("Routed", "RTE", 1, 10, msg.sender, true, false, false));
    }
    function mint(PitAdvancedToken token, address to, uint256 amount) external { token.mint(to, amount); }
}

contract PitOperationsSecurityTest {
    VmSecurity internal constant VM = VmSecurity(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA401);

    function testAdminIsSingleAndTransfersAfterDelay() public {
        PitTokenFactory factory = new PitTokenFactory();
        VM.prank(ALICE);
        PitAdvancedToken token = PitAdvancedToken(factory.createAdvanced("A", "A", 1, 10, ALICE, true, false, true));
        bytes32 adminRole = token.DEFAULT_ADMIN_ROLE();
        bytes32 minterRole = token.MINTER_ROLE();
        require(token.defaultAdmin() == ALICE && token.defaultAdminDelay() == 1 days, "initial admin");
        require(!token.hasRole(adminRole, address(factory)), "factory admin");
        VM.prank(ALICE); VM.expectRevert(); token.grantRole(adminRole, BOB);
        VM.prank(BOB); VM.expectRevert(); token.grantRole(minterRole, BOB);
        VM.prank(ALICE); token.beginDefaultAdminTransfer(BOB);
        VM.prank(BOB); VM.expectRevert(); token.acceptDefaultAdminTransfer();
        VM.warp(block.timestamp + 1 days + 1);
        VM.prank(BOB); token.acceptDefaultAdminTransfer();
        require(token.defaultAdmin() == BOB && !token.hasRole(adminRole, ALICE), "transfer");
        VM.prank(ALICE); VM.expectRevert(); token.grantRole(minterRole, CAROL);
        VM.prank(BOB); token.grantRole(minterRole, CAROL);
        VM.prank(CAROL); token.mint(CAROL, 9);
        require(token.totalSupply() == 10, "cap");
    }

    function testRoutedFactoryCallGivesRoleToActualCallerContract() public {
        PitTokenFactory factory = new PitTokenFactory();
        FactoryContractCaller caller = new FactoryContractCaller();
        VM.prank(ALICE); PitAdvancedToken token = caller.create(factory);
        require(token.defaultAdmin() == address(caller), "routed admin");
        require(!token.hasRole(token.DEFAULT_ADMIN_ROLE(), ALICE), "EOA must not be inferred");
        VM.prank(ALICE); VM.expectRevert(); token.mint(ALICE, 1);
        caller.mint(token, ALICE, 1);
        require(token.balanceOf(ALICE) == 2, "routed mint");
    }

    function testExistingAllowanceCannotBeSpentByOtherCaller() public {
        PitStandardToken token = new PitStandardToken("T", "T", 100, ALICE);
        PitMultiSender sender = new PitMultiSender();
        VM.prank(ALICE); token.approve(address(sender), 100);
        address[] memory recipients = new address[](1); recipients[0] = CAROL;
        uint256[] memory amounts = new uint256[](1); amounts[0] = 10;
        VM.prank(BOB); VM.expectRevert(); sender.send(token, recipients, amounts);
        require(token.balanceOf(ALICE) == 100 && token.balanceOf(CAROL) == 0, "payer drained");
    }

    function testMultiSenderLimitsAndTokenFailuresRollBack() public {
        PitMultiSender sender = new PitMultiSender();
        PitStandardToken token = new PitStandardToken("T", "T", 200, address(this));
        token.approve(address(sender), 200);
        address[] memory zero = new address[](0);
        uint256[] memory noAmounts = new uint256[](0);
        VM.expectRevert(); sender.send(token, zero, noAmounts);
        address[] memory recipients = new address[](101);
        uint256[] memory amounts = new uint256[](101);
        for (uint256 i; i < 101; ++i) { recipients[i] = address(uint160(i + 1)); amounts[i] = 1; }
        VM.expectRevert(); sender.send(token, recipients, amounts);
        require(token.balanceOf(address(this)) == 200, "boundary rollback");
        address[] memory one = new address[](1); one[0] = ALICE;
        uint256[] memory ten = new uint256[](1); ten[0] = 10;
        FalseTransferToken falseToken = new FalseTransferToken();
        falseToken.approve(address(sender), 10);
        VM.expectRevert(); sender.send(falseToken, one, ten);
        require(falseToken.balanceOf(address(this)) == 100 && falseToken.balanceOf(ALICE) == 0, "false rollback");
        RevertingTransferToken revertToken = new RevertingTransferToken();
        revertToken.approve(address(sender), 10);
        VM.expectRevert(); sender.send(revertToken, one, ten);
        require(revertToken.balanceOf(address(this)) == 100, "revert rollback");
    }

    function testLockUnrelatedTokenAndDirectDepositCannotBeClaimed() public {
        VM.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", 100, address(this));
        PitStandardToken unrelated = new PitStandardToken("U", "U", 1, address(this));
        PitTokenLock lock = new PitTokenLock(token, ALICE, 1100);
        require(token.transfer(address(lock), 1), "direct transfer");
        require(unrelated.transfer(address(lock), 1), "wrong token transfer");
        require(lock.deposited() == 0 && lock.beneficiary() == ALICE, "immutable accounting");
        VM.warp(1100);
        VM.prank(ALICE); VM.expectRevert(); lock.release();
        require(token.balanceOf(address(lock)) == 1 && unrelated.balanceOf(address(lock)) == 1, "unsolicited funds");
    }

    function testVestingUnsolicitedLateTokensDoNotChangeAllocation() public {
        VM.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", 12, address(this));
        PitTokenVesting vest = new PitTokenVesting(token, ALICE, 1100, 100, 1150, 10);
        token.approve(address(vest), 10); vest.fund();
        VM.warp(1200);
        require(token.transfer(address(vest), 2), "late direct transfer");
        VM.prank(ALICE); require(vest.release() == 10, "scheduled release");
        require(vest.released() == 10 && token.balanceOf(address(vest)) == 2, "late amount excluded");
    }

    function testSixDecimalTokenUsesRawUnitsAndRejectsZeroFunding() public {
        VM.warp(1000);
        SixDecimalToken token = new SixDecimalToken();
        require(token.decimals() == 6, "precision");
        PitTokenLock lock = new PitTokenLock(token, ALICE, 1100);
        token.approve(address(lock), 1_000_000);
        VM.expectRevert(); lock.fund(0);
        lock.fund(1_000_000);
        VM.warp(1100);
        VM.prank(ALICE); require(lock.release() == 1_000_000, "raw six decimals");
    }

    function testTaxedFundingAndMalformedTokenAreRejected() public {
        VM.warp(1000);
        TaxedFundingToken taxed = new TaxedFundingToken();
        PitTokenLock lock = new PitTokenLock(taxed, ALICE, 1100);
        PitTokenVesting vest = new PitTokenVesting(taxed, ALICE, 1100, 100, 1125, 10);
        taxed.approve(address(lock), 10);
        taxed.approve(address(vest), 10);
        VM.expectRevert(); lock.fund(10);
        VM.expectRevert(); vest.fund();
        require(lock.deposited() == 0 && taxed.balanceOf(address(lock)) == 0, "lock rollback");
        require(!vest.funded() && taxed.balanceOf(address(vest)) == 0, "vesting rollback");
        PitMultiSender sender = new PitMultiSender();
        EmptyReturnToken malformed = new EmptyReturnToken();
        address[] memory recipients = new address[](1); recipients[0] = ALICE;
        uint256[] memory amounts = new uint256[](1); amounts[0] = 1;
        VM.expectRevert(); sender.send(IERC20(address(malformed)), recipients, amounts);
    }

    function testFuzzCapCannotBeExceeded(uint96 initialRaw, uint96 extraRaw) public {
        uint256 initial = uint256(initialRaw) + 1;
        uint256 extra = uint256(extraRaw) + 1;
        PitAdvancedToken token = new PitAdvancedToken("A", "A", initial, initial + extra, ALICE, address(this), true, false, false);
        token.mint(BOB, extra);
        require(token.totalSupply() == token.cap(), "cap conservation");
        VM.expectRevert(); token.mint(BOB, 1);
    }

    function testFuzzLockerTimeBoundary(uint40 offset) public {
        VM.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", 1, address(this));
        uint64 unlock = uint64(1001 + uint64(offset));
        PitTokenLock lock = new PitTokenLock(token, ALICE, unlock);
        token.approve(address(lock), 1); lock.fund(1);
        VM.warp(unlock - 1);
        VM.prank(ALICE); VM.expectRevert(); lock.release();
        VM.warp(unlock);
        VM.prank(ALICE); require(lock.release() == 1, "at unlock");
    }

    function testFuzzVestingCliffAndEnd(uint96 raw, uint32 durationSeed, uint32 cliffSeed) public {
        uint256 amount = uint256(raw) + 1;
        uint64 duration = uint64(durationSeed % 1_000_000) + 1;
        uint64 offset = uint64(cliffSeed) % (duration + 1);
        VM.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", amount, address(this));
        PitTokenVesting vest = new PitTokenVesting(token, ALICE, 1100, duration, 1100 + offset, amount);
        token.approve(address(vest), amount); vest.fund();
        if (offset > 0) require(vest.vestedAt(1100 + offset - 1) == 0, "before cliff");
        require(vest.vestedAt(1100 + duration) == amount, "full end");
        require(vest.vestedAt(1100 + duration + 1) == amount, "after end");
    }
}
