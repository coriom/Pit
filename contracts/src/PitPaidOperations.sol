// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PitPaidBase} from "./PitPaidBase.sol";
import {PitTokenLock, PitTokenVesting} from "./PitSchedules.sol";

/// @notice Local fee-aware entry points. No arbitrary calls, custody role, or remote deployment configuration.
/// @dev The public legacy contracts remain callable without this guided paid route.
contract PitPaidOperations is PitPaidBase {
    using SafeERC20 for IERC20;

    struct VestingConfig {
        IERC20 token; uint256 amount; address beneficiary; uint64 start; uint64 duration; uint64 cliff;
    }

    constructor(IERC20 paymentToken_, address feeRecipient_, address administrator_, Prices memory initialPrices)
        PitPaidBase(paymentToken_, feeRecipient_, administrator_, initialPrices) {}

    function multiSend(
        IERC20 token, address[] calldata recipients, uint256[] calldata amounts, Quote calldata quote
    ) external nonReentrant returns (uint256 total) {
        uint256 n = recipients.length;
        if (address(token) == address(0) || n == 0 || n > MAX_RECIPIENTS || amounts.length != n) revert InvalidBatch();
        _charge(MULTISEND, quote, multiFee(n));
        total = _multiTransfer(token, recipients, amounts);
        emit OperationExecuted(msg.sender, MULTISEND, quote.intentId, keccak256(msg.data), address(0));
    }

    function _multiTransfer(IERC20 token, address[] calldata recipients, uint256[] calldata amounts)
        private returns (uint256 total)
    {
        uint256 n = recipients.length;
        for (uint256 i; i < n; ++i) {
            if (recipients[i] == address(0) || recipients[i] == msg.sender || amounts[i] == 0) revert InvalidBatch();
            for (uint256 j; j < i; ++j) if (recipients[j] == recipients[i]) revert InvalidBatch();
            total += amounts[i];
        }
        if (token.balanceOf(msg.sender) < total || token.allowance(msg.sender, address(this)) < total) revert InvalidBatch();
        uint256 payerBefore = token.balanceOf(msg.sender);
        for (uint256 i; i < n; ++i) {
            uint256 beforeBalance = token.balanceOf(recipients[i]);
            token.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
            if (token.balanceOf(recipients[i]) != beforeBalance + amounts[i]) revert UnsupportedToken();
        }
        if (token.balanceOf(msg.sender) != payerBefore - total) revert UnsupportedToken();
    }

    function createLock(
        IERC20 token, uint256 amount, address beneficiary, uint64 unlockTime, Quote calldata quote
    ) external nonReentrant returns (address instance) {
        _charge(LOCK, quote, prices.lockFee);
        PitTokenLock lock = new PitTokenLock(token, beneficiary, unlockTime);
        _fund(token, address(lock), amount, false);
        instance = address(lock);
        emit OperationExecuted(msg.sender, LOCK, quote.intentId, keccak256(msg.data), instance);
    }

    function createVesting(
        VestingConfig calldata config, Quote calldata quote
    ) external nonReentrant returns (address instance) {
        _charge(VESTING, quote, prices.vestingFee);
        PitTokenVesting vest = new PitTokenVesting(config.token, config.beneficiary, config.start, config.duration, config.cliff, config.amount);
        _fund(config.token, address(vest), config.amount, true);
        instance = address(vest);
        emit OperationExecuted(msg.sender, VESTING, quote.intentId, keccak256(msg.data), instance);
    }

    function _fund(IERC20 token, address instance, uint256 amount, bool vesting) private {
        if (address(token) == address(0) || amount == 0) revert InvalidConfiguration();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedToken();
        token.forceApprove(instance, amount);
        if (vesting) PitTokenVesting(instance).fund();
        else PitTokenLock(instance).fund(amount);
        token.forceApprove(instance, 0);
        if (token.balanceOf(address(this)) != beforeBalance || token.allowance(address(this), instance) != 0) revert UnsupportedToken();
    }
}
