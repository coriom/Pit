// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Owner-defined ERC-1155 IDs with immutable per-ID caps and URI template.
/// @dev Each ID must be defined once. Only the owner can mint; holders can burn their own units.
contract Pit1155Collection is ERC1155Supply, ERC1155Burnable, Ownable, ReentrancyGuard {
    uint256 public constant MAX_BATCH = 40;
    mapping(uint256 => uint256) public capOf;
    mapping(uint256 => bool) public defined;
    error InvalidDefinition();
    error CapExceeded();
    event TokenDefined(uint256 indexed id, uint256 cap, address indexed recipient, uint256 amount);

    function _update(address from, address to, uint256[] memory ids, uint256[] memory amounts)
        internal override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, amounts);
    }

    constructor(string memory uriTemplate, address owner_) ERC1155(uriTemplate) Ownable(owner_) {
        if (bytes(uriTemplate).length == 0 || bytes(uriTemplate).length > 512 || owner_ == address(0)) revert InvalidDefinition();
    }

    function defineToken(uint256 id, uint256 cap, uint256 initialAmount, address recipient)
        external onlyOwner nonReentrant
    {
        if (defined[id] || cap == 0 || initialAmount > cap || recipient == address(0)) revert InvalidDefinition();
        defined[id] = true;
        capOf[id] = cap;
        if (initialAmount > 0) _mint(recipient, id, initialAmount, "");
        emit TokenDefined(id, cap, recipient, initialAmount);
    }

    function mint(address recipient, uint256 id, uint256 amount) external onlyOwner nonReentrant {
        if (!defined[id] || recipient == address(0) || amount == 0) revert InvalidDefinition();
        if (amount > capOf[id] - totalSupply(id)) revert CapExceeded();
        _mint(recipient, id, amount, "");
    }

    function mintBatch(address recipient, uint256[] calldata ids, uint256[] calldata amounts)
        external onlyOwner nonReentrant
    {
        if (recipient == address(0) || ids.length == 0 || ids.length > MAX_BATCH || ids.length != amounts.length) revert InvalidDefinition();
        for (uint256 i; i < ids.length; ++i) {
            if (!defined[ids[i]] || amounts[i] == 0 || amounts[i] > capOf[ids[i]] - totalSupply(ids[i])) revert InvalidDefinition();
            for (uint256 j; j < i; ++j) if (ids[i] == ids[j]) revert InvalidDefinition();
        }
        _mintBatch(recipient, ids, amounts, "");
    }
}

/// @notice Atomic ERC-1155 distribution from msg.sender. Requires collection-wide operator approval.
/// @dev No custody or recovery role. A failed receiver reverts the entire batch.
contract Pit1155BatchSender is ReentrancyGuard {
    uint256 public constant MAX_TRANSFERS = 40;
    error InvalidBatch();
    event BatchSent(address indexed sender, address indexed collection, uint256 count);

    function send(IERC1155 collection, uint256[] calldata ids, uint256[] calldata amounts, address[] calldata recipients)
        external nonReentrant
    {
        uint256 n = ids.length;
        if (address(collection) == address(0) || n == 0 || n > MAX_TRANSFERS || amounts.length != n || recipients.length != n) revert InvalidBatch();
        if (!collection.isApprovedForAll(msg.sender, address(this))) revert InvalidBatch();
        for (uint256 i; i < n; ++i) {
            if (recipients[i] == address(0) || recipients[i] == msg.sender || amounts[i] == 0) revert InvalidBatch();
            for (uint256 j; j < i; ++j) if (ids[i] == ids[j] && recipients[i] == recipients[j]) revert InvalidBatch();
        }
        for (uint256 i; i < n; ++i) collection.safeTransferFrom(msg.sender, recipients[i], ids[i], amounts[i], "");
        emit BatchSent(msg.sender, address(collection), n);
    }
}
