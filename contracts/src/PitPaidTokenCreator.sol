// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PitPaidBase} from "./PitPaidBase.sol";
import {PitStandardToken, PitAdvancedToken} from "./PitTokens.sol";

/// @notice Fee-aware token creation without wrapper ownership or PIT roles.
contract PitPaidTokenCreator is PitPaidBase {
    struct AdvancedConfig {
        string name; string symbol; uint256 supply; uint256 cap; address recipient;
        bool minting; bool burning; bool pausing;
    }
    constructor(IERC20 paymentToken_, address feeRecipient_, address administrator_, Prices memory initialPrices)
        PitPaidBase(paymentToken_, feeRecipient_, administrator_, initialPrices) {}
    function createStandard(string calldata name_, string calldata symbol_, uint256 supply, address recipient, Quote calldata quote)
        external nonReentrant returns (address token)
    {
        _charge(STANDARD, quote, prices.standard);
        token = address(new PitStandardToken(name_, symbol_, supply, recipient));
        emit OperationExecuted(msg.sender, STANDARD, quote.intentId, keccak256(msg.data), token);
    }
    function createAdvanced(AdvancedConfig calldata config, Quote calldata quote)
        external nonReentrant returns (address token)
    {
        _charge(ADVANCED, quote, prices.advanced);
        token = address(new PitAdvancedToken(config.name, config.symbol, config.supply, config.cap,
            config.recipient, msg.sender, config.minting, config.burning, config.pausing));
        emit OperationExecuted(msg.sender, ADVANCED, quote.intentId, keccak256(msg.data), token);
    }
}
