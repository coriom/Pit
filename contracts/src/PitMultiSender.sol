// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Atomic direct transfers from the caller. The contract never retains tokens.
contract PitMultiSender is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant MAX_RECIPIENTS = 100;
    error InvalidBatch();
    error UnsupportedToken();
    event BatchSent(address indexed sender, address indexed token, uint256 recipients, uint256 total);

    function send(IERC20 token, address[] calldata recipients, uint256[] calldata amounts)
        external nonReentrant returns (uint256 total)
    {
        uint256 length = recipients.length;
        if (address(token) == address(0) || length == 0 || length > MAX_RECIPIENTS || length != amounts.length) {
            revert InvalidBatch();
        }
        for (uint256 i; i < length; ++i) {
            if (recipients[i] == address(0) || recipients[i] == msg.sender || amounts[i] == 0) revert InvalidBatch();
            for (uint256 j; j < i; ++j) if (recipients[j] == recipients[i]) revert InvalidBatch();
            total += amounts[i];
        }
        if (token.balanceOf(msg.sender) < total || token.allowance(msg.sender, address(this)) < total) {
            revert InvalidBatch();
        }
        uint256 senderBefore = token.balanceOf(msg.sender);
        for (uint256 i; i < length; ++i) {
            uint256 beforeBalance = token.balanceOf(recipients[i]);
            token.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
            if (token.balanceOf(recipients[i]) != beforeBalance + amounts[i]) revert UnsupportedToken();
        }
        if (token.balanceOf(msg.sender) != senderBefore - total) revert UnsupportedToken();
        emit BatchSent(msg.sender, address(token), length, total);
    }
}
