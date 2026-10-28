// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pit1155Collection, Pit1155BatchSender} from "../src/Pit1155.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface Vm6 {
    function prank(address) external;
    function expectRevert() external;
    function assume(bool) external;
}

contract Reject1155 {}

contract Reenter1155 is IERC1155Receiver {
    Pit1155BatchSender private immutable sender;
    Pit1155Collection private immutable token;
    bool public reentryBlocked;
    constructor(Pit1155BatchSender sender_, Pit1155Collection token_) { sender = sender_; token = token_; }
    function supportsInterface(bytes4 id) external pure returns (bool) { return id == type(IERC1155Receiver).interfaceId || id == type(IERC165).interfaceId; }
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        uint256[] memory amounts = new uint256[](1); amounts[0] = 1;
        address[] memory recipients = new address[](1); recipients[0] = address(0xB0B);
        try sender.send(token, ids, amounts, recipients) {} catch { reentryBlocked = true; }
        return IERC1155Receiver.onERC1155Received.selector;
    }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }
}

contract PitPhase6Test is IERC1155Receiver {
    Vm6 constant vm = Vm6(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant ATTACKER = address(0xBAD);

    function supportsInterface(bytes4 id) external pure returns (bool) { return id == type(IERC1155Receiver).interfaceId || id == type(IERC165).interfaceId; }
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) { return IERC1155Receiver.onERC1155Received.selector; }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) { return IERC1155Receiver.onERC1155BatchReceived.selector; }

    function fresh() internal returns (Pit1155Collection, Pit1155BatchSender) {
        return (new Pit1155Collection("ipfs://example/{id}.json", address(this)), new Pit1155BatchSender());
    }

    function testDefinitionCapOwnerBurnAndUri() public {
        (Pit1155Collection token,) = fresh();
        token.defineToken(7, 10, 3, ALICE);
        require(token.balanceOf(ALICE, 7) == 3 && token.totalSupply(7) == 3 && token.capOf(7) == 10);
        require(keccak256(bytes(token.uri(7))) == keccak256(bytes("ipfs://example/{id}.json")));
        vm.prank(ATTACKER); vm.expectRevert(); token.mint(ATTACKER, 7, 1);
        vm.expectRevert(); token.defineToken(7, 20, 1, ALICE);
        vm.expectRevert(); token.mint(BOB, 8, 1);
        token.mint(BOB, 7, 7);
        vm.expectRevert(); token.mint(BOB, 7, 1);
        vm.prank(ALICE); token.burn(ALICE, 7, 2);
        require(token.balanceOf(ALICE, 7) == 1 && token.totalSupply(7) == 8);
        vm.prank(ATTACKER); vm.expectRevert(); token.burn(BOB, 7, 1);
    }

    function testBatchMintRejectsDuplicateIdAndExcess() public {
        (Pit1155Collection token,) = fresh();
        token.defineToken(1, 10, 0, ALICE);
        token.defineToken(2, 5, 0, ALICE);
        uint256[] memory ids = new uint256[](2); ids[0] = 1; ids[1] = 2;
        uint256[] memory amounts = new uint256[](2); amounts[0] = 4; amounts[1] = 5;
        token.mintBatch(BOB, ids, amounts);
        require(token.balanceOf(BOB, 1) == 4 && token.balanceOf(BOB, 2) == 5);
        ids[1] = 1;
        vm.expectRevert(); token.mintBatch(BOB, ids, amounts);
        require(token.balanceOf(BOB, 1) == 4 && token.balanceOf(BOB, 2) == 5);
    }

    function testBatchSenderAtomicAndOperatorScope() public {
        (Pit1155Collection token, Pit1155BatchSender sender) = fresh();
        token.defineToken(1, 10, 5, address(this));
        token.defineToken(2, 10, 4, address(this));
        uint256[] memory ids = new uint256[](2); ids[0] = 1; ids[1] = 2;
        uint256[] memory amounts = new uint256[](2); amounts[0] = 2; amounts[1] = 3;
        address[] memory recipients = new address[](2); recipients[0] = ALICE; recipients[1] = BOB;
        vm.expectRevert(); sender.send(token, ids, amounts, recipients);
        token.setApprovalForAll(address(sender), true);
        vm.prank(ATTACKER); vm.expectRevert(); sender.send(token, ids, amounts, recipients);
        recipients[1] = address(new Reject1155());
        vm.expectRevert(); sender.send(token, ids, amounts, recipients);
        require(token.balanceOf(ALICE, 1) == 0 && token.balanceOf(address(this), 1) == 5);
        recipients[1] = BOB;
        sender.send(token, ids, amounts, recipients);
        require(token.balanceOf(ALICE, 1) == 2 && token.balanceOf(BOB, 2) == 3);
        require(token.balanceOf(address(this), 1) == 3 && token.balanceOf(address(this), 2) == 1);
        require(token.balanceOf(address(sender), 1) == 0 && token.balanceOf(address(sender), 2) == 0);
        token.setApprovalForAll(address(sender), false);
        vm.expectRevert(); sender.send(token, ids, amounts, recipients);
    }

    function testFuzzCapConservation(uint96 capRaw, uint96 mintRaw) public {
        vm.assume(capRaw > 0 && mintRaw > 0 && mintRaw <= capRaw);
        (Pit1155Collection token,) = fresh();
        token.defineToken(11, capRaw, mintRaw, ALICE);
        require(token.totalSupply(11) == mintRaw && token.totalSupply(11) <= token.capOf(11));
        uint256 remaining = uint256(capRaw) - mintRaw;
        if (remaining > 0) token.mint(BOB, 11, remaining);
        require(token.totalSupply(11) == capRaw);
        vm.expectRevert(); token.mint(BOB, 11, 1);
    }

    function testReceiverCallbackCannotReenterSender() public {
        (Pit1155Collection token, Pit1155BatchSender sender) = fresh();
        token.defineToken(1, 5, 3, address(this));
        token.setApprovalForAll(address(sender), true);
        Reenter1155 receiver = new Reenter1155(sender, token);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        uint256[] memory amounts = new uint256[](1); amounts[0] = 1;
        address[] memory recipients = new address[](1); recipients[0] = address(receiver);
        sender.send(token, ids, amounts, recipients);
        require(receiver.reentryBlocked() && token.balanceOf(address(receiver), 1) == 1 && token.balanceOf(address(sender), 1) == 0);
    }

    function testFortyRecipientBoundary() public {
        (Pit1155Collection token, Pit1155BatchSender sender) = fresh();
        token.defineToken(1, 40, 40, address(this));
        token.setApprovalForAll(address(sender), true);
        uint256[] memory ids = new uint256[](40);
        uint256[] memory amounts = new uint256[](40);
        address[] memory recipients = new address[](40);
        for (uint256 i; i < 40; ++i) { ids[i] = 1; amounts[i] = 1; recipients[i] = address(uint160(1000 + i)); }
        sender.send(token, ids, amounts, recipients);
        require(token.balanceOf(address(this), 1) == 0 && token.balanceOf(address(sender), 1) == 0);
        for (uint256 i; i < 40; ++i) require(token.balanceOf(recipients[i], 1) == 1);
        uint256[] memory tooManyIds = new uint256[](41);
        uint256[] memory tooManyAmounts = new uint256[](41);
        address[] memory tooManyRecipients = new address[](41);
        vm.expectRevert(); sender.send(token, tooManyIds, tooManyAmounts, tooManyRecipients);
    }
}
