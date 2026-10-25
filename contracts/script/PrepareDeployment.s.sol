// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PitTokenFactory} from "../src/PitTokens.sol";
import {PitMultiSender} from "../src/PitMultiSender.sol";
import {PitTokenLock, PitTokenVesting} from "../src/PitSchedules.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Simulation-only deployment plan. No startBroadcast, private-key access, or fee hook.
/// @dev Even if a caller mistakenly adds --broadcast, this script records no broadcast transaction.
contract PrepareDeployment {
    error UnsupportedChain();

    modifier reviewedChain() {
        if (block.chainid != 31337 && block.chainid != 84532) revert UnsupportedChain();
        _;
    }

    function run() external reviewedChain returns (address factory, address sender) {
        factory = address(new PitTokenFactory());
        sender = address(new PitMultiSender());
    }

    function previewLock(IERC20 token, address beneficiary, uint64 unlockTime)
        external reviewedChain returns (address lock)
    {
        lock = address(new PitTokenLock(token, beneficiary, unlockTime));
    }

    function previewVesting(
        IERC20 token, address beneficiary, uint64 start, uint64 duration, uint64 cliff, uint256 allocation
    ) external reviewedChain returns (address vesting) {
        vesting = address(new PitTokenVesting(token, beneficiary, start, duration, cliff, allocation));
    }
}
