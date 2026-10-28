// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pit1155Collection, Pit1155BatchSender} from "../src/Pit1155.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract Pit1155Handler is IERC1155Receiver {
    Pit1155Collection public immutable collection;
    Pit1155BatchSender public immutable sender;
    address public constant RECIPIENT = address(0xB0B);
    uint256 public calls;

    constructor() {
        collection = new Pit1155Collection("ipfs://sample/{id}.json", address(this));
        sender = new Pit1155BatchSender();
        collection.defineToken(1, 1000, 100, address(this));
        collection.setApprovalForAll(address(sender), true);
    }
    function supportsInterface(bytes4 id) external pure returns (bool) { return id == type(IERC1155Receiver).interfaceId || id == type(IERC165).interfaceId; }
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) { return IERC1155Receiver.onERC1155Received.selector; }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) { return IERC1155Receiver.onERC1155BatchReceived.selector; }

    function mint(uint96 seed) external {
        ++calls;
        uint256 available = collection.capOf(1) - collection.totalSupply(1);
        uint256 amount = uint256(seed) % (available + 1);
        if (amount > 0) collection.mint(address(this), 1, amount);
    }
    function burn(uint96 seed) external {
        ++calls;
        uint256 balance = collection.balanceOf(address(this), 1);
        uint256 amount = uint256(seed) % (balance + 1);
        if (amount > 0) collection.burn(address(this), 1, amount);
    }
    function send(uint96 seed) external {
        ++calls;
        uint256 balance = collection.balanceOf(address(this), 1);
        uint256 amount = uint256(seed) % (balance + 1);
        if (amount == 0) return;
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        uint256[] memory amounts = new uint256[](1); amounts[0] = amount;
        address[] memory recipients = new address[](1); recipients[0] = RECIPIENT;
        sender.send(collection, ids, amounts, recipients);
    }
}

contract Pit1155InvariantTest {
    Pit1155Handler internal handler;
    address[] private targets;
    function setUp() public { handler = new Pit1155Handler(); targets.push(address(handler)); }
    function targetContracts() public view returns (address[] memory) { return targets; }
    function invariant_CapAndBalanceConservation() public view {
        Pit1155Collection collection = handler.collection();
        require(collection.totalSupply(1) <= collection.capOf(1), "cap exceeded");
        require(collection.totalSupply(1) == collection.balanceOf(address(handler), 1) + collection.balanceOf(handler.RECIPIENT(), 1), "balance conservation");
        require(collection.balanceOf(address(handler.sender()), 1) == 0, "helper held assets");
        require(collection.owner() == address(handler), "owner changed");
    }
    function afterInvariant() public view { require(handler.calls() > 0, "handler not exercised"); }
}
