// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721URIStorage
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Owner-minted collection with immutable per-token URI and finite cap.
contract PitNftCollection is ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 public immutable maxSupply;
    uint256 public nextTokenId = 1;
    error InvalidCollection();
    error SupplyExhausted();
    event Minted(address indexed recipient, uint256 indexed tokenId, string uri);

    constructor(string memory name_, string memory symbol_, address owner_, uint256 maxSupply_)
        ERC721(name_, symbol_)
        Ownable(owner_)
    {
        if (
            bytes(name_).length == 0 || bytes(symbol_).length == 0 || owner_ == address(0)
                || maxSupply_ == 0 || maxSupply_ > 1_000_000
        ) revert InvalidCollection();
        maxSupply = maxSupply_;
    }

    function mint(address recipient, string calldata uri)
        external
        onlyOwner
        nonReentrant
        returns (uint256 tokenId)
    {
        if (recipient == address(0) || bytes(uri).length == 0 || bytes(uri).length > 512) revert InvalidCollection();
        tokenId = nextTokenId;
        if (tokenId > maxSupply) revert SupplyExhausted();
        nextTokenId = tokenId + 1;
        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, uri);
        emit Minted(recipient, tokenId, uri);
    }
}

/// @notice Atomic ERC-721 transfers from the caller using exact token approvals.
contract PitNftBatchSender is ReentrancyGuard {
    uint256 public constant MAX_TOKENS = 50;
    error InvalidBatch();
    event BatchSent(address indexed sender, address indexed collection, uint256 tokens);

    function send(IERC721 collection, uint256[] calldata tokenIds, address[] calldata recipients)
        external
        nonReentrant
    {
        uint256 length = tokenIds.length;
        if (
            address(collection) == address(0) || length == 0 || length > MAX_TOKENS
                || length != recipients.length
        ) {
            revert InvalidBatch();
        }
        for (uint256 i; i < length; ++i) {
            if (
                recipients[i] == address(0) || recipients[i] == msg.sender
                    || collection.ownerOf(tokenIds[i]) != msg.sender
            ) {
                revert InvalidBatch();
            }
            if (
                collection.getApproved(tokenIds[i]) != address(this)
                    && !collection.isApprovedForAll(msg.sender, address(this))
            ) revert InvalidBatch();
            for (uint256 j; j < i; ++j) {
                if (tokenIds[j] == tokenIds[i]) revert InvalidBatch();
            }
        }
        for (uint256 i; i < length; ++i) {
            collection.safeTransferFrom(msg.sender, recipients[i], tokenIds[i]);
        }
        emit BatchSent(msg.sender, address(collection), length);
    }
}
