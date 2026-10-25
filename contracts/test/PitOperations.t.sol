// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PitStandardToken, PitAdvancedToken, PitTokenFactory} from "../src/PitTokens.sol";
import {PitMultiSender} from "../src/PitMultiSender.sol";
import {PitTokenLock, PitTokenVesting} from "../src/PitSchedules.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function assume(bool) external;
}

contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") { _mint(msg.sender, 1_000_000); }
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0xdead), 1);
            amount -= 1;
        }
        super._update(from, to, amount);
    }
}

contract ReenterToken is ERC20 {
    PitMultiSender public target;
    bool public attempted;
    bool public blocked;
    constructor() ERC20("Reenter", "REN") { _mint(msg.sender, 100); }
    function setTarget(PitMultiSender sender) external { target = sender; }
    function _update(address from, address to, uint256 amount) internal override {
        if (address(target) != address(0) && from != address(0) && to != address(0) && !attempted) {
            attempted = true;
            address[] memory recipients = new address[](1); recipients[0] = address(0xCA401);
            uint256[] memory amounts = new uint256[](1); amounts[0] = 1;
            try target.send(this, recipients, amounts) { } catch { blocked = true; }
        }
        super._update(from, to, amount);
    }
}

contract PitOperationsTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant CAROL = address(0xCA401);

    function assertEq(uint256 a, uint256 b) internal pure { require(a == b, "not equal"); }
    function assertEq(address a, address b) internal pure { require(a == b, "not equal"); }
    function assertTrue(bool value) internal pure { require(value, "false"); }

    function testStandardFactoryFixedSupplyAndRecipient() public {
        PitTokenFactory factory = new PitTokenFactory();
        vm.prank(ALICE);
        PitStandardToken token = PitStandardToken(factory.createStandard("PIT Test", "PITT", 1000 ether, BOB));
        assertEq(token.totalSupply(), 1000 ether);
        assertEq(token.balanceOf(BOB), 1000 ether);
        assertEq(token.decimals(), 18);
        vm.prank(BOB);
        token.transfer(CAROL, 7 ether);
        assertEq(token.balanceOf(CAROL), 7 ether);
    }

    function testStandardRejectsInvalidConfiguration() public {
        vm.expectRevert(); new PitStandardToken("", "X", 1, ALICE);
        vm.expectRevert(); new PitStandardToken("X", "", 1, ALICE);
        vm.expectRevert(); new PitStandardToken("X", "X", 0, ALICE);
        vm.expectRevert(); new PitStandardToken("X", "X", 1, address(0));
    }

    function testAdvancedCreatorAloneControlsMintAndPause() public {
        PitTokenFactory factory = new PitTokenFactory();
        vm.prank(ALICE);
        PitAdvancedToken token = PitAdvancedToken(factory.createAdvanced("Advanced", "ADV", 10 ether, 20 ether, BOB, true, true, true));
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), ALICE));
        assertTrue(token.hasRole(token.MINTER_ROLE(), ALICE));
        assertTrue(!token.hasRole(token.DEFAULT_ADMIN_ROLE(), address(factory)));
        vm.prank(BOB); vm.expectRevert(); token.mint(BOB, 1);
        vm.prank(ALICE); token.mint(BOB, 10 ether);
        assertEq(token.totalSupply(), 20 ether);
        vm.prank(ALICE); vm.expectRevert(); token.mint(BOB, 1);
        vm.prank(ALICE); token.pause();
        vm.prank(BOB); vm.expectRevert(); token.transfer(CAROL, 1);
        vm.prank(ALICE); token.unpause();
        vm.prank(BOB); token.burn(1 ether);
        assertEq(token.totalSupply(), 19 ether);
    }

    function testAdvancedDisabledFeaturesStayDisabledEvenIfRoleGranted() public {
        PitAdvancedToken token = new PitAdvancedToken("Fixed", "FIX", 100, 100, ALICE, address(this), false, false, false);
        token.grantRole(token.MINTER_ROLE(), address(this));
        vm.expectRevert(); token.mint(ALICE, 1);
        vm.expectRevert(); token.pause();
        vm.prank(ALICE); vm.expectRevert(); token.burn(1);
        assertEq(token.totalSupply(), 100);
    }

    function testMultiSenderAtomicAndAllowanceBound() public {
        PitStandardToken token = new PitStandardToken("T", "T", 1000, address(this));
        PitMultiSender sender = new PitMultiSender();
        token.approve(address(sender), 30);
        address[] memory recipients = new address[](2);
        recipients[0] = ALICE; recipients[1] = BOB;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10; amounts[1] = 20;
        assertEq(sender.send(token, recipients, amounts), 30);
        assertEq(token.balanceOf(ALICE), 10);
        assertEq(token.balanceOf(BOB), 20);
        assertEq(token.balanceOf(address(this)), 970);
        assertEq(token.allowance(address(this), address(sender)), 0);
        vm.expectRevert(); sender.send(token, recipients, amounts);
    }

    function testMultiSenderRollbackDuplicateAndBadRecipient() public {
        PitStandardToken token = new PitStandardToken("T", "T", 100, address(this));
        PitMultiSender sender = new PitMultiSender();
        token.approve(address(sender), 100);
        address[] memory recipients = new address[](2);
        recipients[0] = ALICE; recipients[1] = ALICE;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10; amounts[1] = 20;
        vm.expectRevert(); sender.send(token, recipients, amounts);
        assertEq(token.balanceOf(ALICE), 0);
        recipients[1] = address(0);
        vm.expectRevert(); sender.send(token, recipients, amounts);
        recipients[1] = BOB; amounts[1] = 200;
        vm.expectRevert(); sender.send(token, recipients, amounts);
        assertEq(token.balanceOf(address(this)), 100);
    }

    function testMultiSenderRejectsFeeTokenAndRollsBack() public {
        FeeToken token = new FeeToken();
        PitMultiSender sender = new PitMultiSender();
        token.approve(address(sender), 10);
        address[] memory recipients = new address[](1); recipients[0] = ALICE;
        uint256[] memory amounts = new uint256[](1); amounts[0] = 10;
        vm.expectRevert(); sender.send(token, recipients, amounts);
        assertEq(token.balanceOf(ALICE), 0);
        assertEq(token.balanceOf(address(this)), 1_000_000);
    }

    function testMultiSenderBlocksTokenCallbackReentrancy() public {
        ReenterToken token = new ReenterToken();
        PitMultiSender sender = new PitMultiSender();
        token.setTarget(sender);
        token.approve(address(sender), 10);
        address[] memory recipients = new address[](1); recipients[0] = ALICE;
        uint256[] memory amounts = new uint256[](1); amounts[0] = 10;
        sender.send(token, recipients, amounts);
        assertTrue(token.attempted());
        assertTrue(token.blocked());
        assertEq(token.balanceOf(ALICE), 10);
    }

    function testFuzzMultiSenderConservation(uint96 a, uint96 b) public {
        vm.assume(a > 0 && b > 0);
        PitStandardToken token = new PitStandardToken("T", "T", uint256(a) + b, address(this));
        PitMultiSender sender = new PitMultiSender();
        token.approve(address(sender), uint256(a) + b);
        address[] memory recipients = new address[](2); recipients[0] = ALICE; recipients[1] = BOB;
        uint256[] memory amounts = new uint256[](2); amounts[0] = a; amounts[1] = b;
        sender.send(token, recipients, amounts);
        assertEq(token.balanceOf(ALICE) + token.balanceOf(BOB), uint256(a) + b);
        assertEq(token.balanceOf(address(sender)), 0);
    }

    function testLockBeforeAtAfterUnlockAndMultipleDeposits() public {
        vm.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", 100, address(this));
        PitTokenLock lock = new PitTokenLock(token, ALICE, 1100);
        token.approve(address(lock), 100);
        lock.fund(60); lock.fund(40);
        vm.prank(ALICE); vm.expectRevert(); lock.release();
        vm.warp(1100);
        vm.prank(BOB); vm.expectRevert(); lock.release();
        vm.prank(ALICE); assertEq(lock.release(), 100);
        assertEq(token.balanceOf(ALICE), 100);
        vm.prank(ALICE); vm.expectRevert(); lock.release();
        vm.expectRevert(); lock.fund(1);
    }

    function testLockRejectsInvalidBeneficiaryAndFailedFunding() public {
        vm.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", 10, address(this));
        vm.expectRevert(); new PitTokenLock(token, address(0), 1100);
        vm.expectRevert(); new PitTokenLock(token, ALICE, 1000);
        PitTokenLock lock = new PitTokenLock(token, ALICE, 1100);
        vm.expectRevert(); lock.fund(10);
        assertEq(lock.deposited(), 0);
    }

    function testVestingCliffRoundingAndConservation() public {
        vm.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", 101, address(this));
        PitTokenVesting vest = new PitTokenVesting(token, ALICE, 1100, 100, 1150, 101);
        token.approve(address(vest), 101); vest.fund();
        assertEq(vest.vestedAt(1099), 0);
        assertEq(vest.vestedAt(1149), 0);
        assertEq(vest.vestedAt(1150), 50);
        assertEq(vest.vestedAt(1199), 99);
        assertEq(vest.vestedAt(1200), 101);
        vm.warp(1150);
        vm.prank(BOB); vm.expectRevert(); vest.release();
        vm.prank(ALICE); assertEq(vest.release(), 50);
        vm.warp(1200);
        vm.prank(ALICE); assertEq(vest.release(), 51);
        assertEq(token.balanceOf(ALICE), 101);
        assertEq(vest.released(), 101);
        vm.prank(ALICE); vm.expectRevert(); vest.release();
    }

    function testVestingNoLateFundingOrBeneficiaryTransfer() public {
        vm.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", 100, address(this));
        PitTokenVesting vest = new PitTokenVesting(token, ALICE, 1100, 100, 1100, 100);
        vm.warp(1100);
        token.approve(address(vest), 100);
        vm.expectRevert(); vest.fund();
        assertEq(vest.vestedAt(1200), 0);
        assertEq(vest.beneficiary(), ALICE);
    }

    function testFuzzVestingMonotonicAndFullAtEnd(uint96 amount, uint64 elapsed) public {
        vm.assume(amount > 0);
        vm.warp(1000);
        PitStandardToken token = new PitStandardToken("T", "T", amount, address(this));
        PitTokenVesting vest = new PitTokenVesting(token, ALICE, 1100, 100, 1125, amount);
        token.approve(address(vest), amount); vest.fund();
        uint64 t = uint64(1100 + (elapsed % 101));
        assertTrue(vest.vestedAt(t) <= amount);
        assertTrue(vest.vestedAt(t) <= vest.vestedAt(t + 1));
        assertEq(vest.vestedAt(1200), amount);
    }
}
