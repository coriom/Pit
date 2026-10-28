// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST-ONLY six-decimal fixture. Not Circle USDC; never deploy to an external chain.
contract PitMockUSDC is ERC20 {
    error LocalOnly();
    constructor(address recipient) ERC20("PIT LOCAL MOCK USDC", "MOCK-USDC") {
        if (block.chainid != 31337) revert LocalOnly();
        _mint(recipient, 1_000_000_000_000);
    }

    function decimals() public pure override returns (uint8) { return 6; }
}
