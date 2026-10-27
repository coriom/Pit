// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Atomic native-asset distribution. Successful calls leave no user funds here.
contract PitNativeMultiSender is ReentrancyGuard {
    uint256 public constant MAX_RECIPIENTS = 100;
    error InvalidBatch();
    error TransferFailed(uint256 index);
    event BatchSent(address indexed sender, uint256 recipients, uint256 total);

    function send(address payable[] calldata recipients, uint256[] calldata amounts)
        external
        payable
        nonReentrant
        returns (uint256 total)
    {
        uint256 length = recipients.length;
        if (length == 0 || length > MAX_RECIPIENTS || length != amounts.length) {
            revert InvalidBatch();
        }
        for (uint256 i; i < length; ++i) {
            if (recipients[i] == address(0) || recipients[i] == msg.sender || amounts[i] == 0) {
                revert InvalidBatch();
            }
            for (uint256 j; j < i; ++j) {
                if (recipients[j] == recipients[i]) revert InvalidBatch();
            }
            total += amounts[i];
        }
        if (total != msg.value) revert InvalidBatch();
        for (uint256 i; i < length; ++i) {
            (bool success,) = recipients[i].call{value: amounts[i]}("");
            if (!success) revert TransferFailed(i);
        }
        emit BatchSent(msg.sender, length, total);
    }
}
