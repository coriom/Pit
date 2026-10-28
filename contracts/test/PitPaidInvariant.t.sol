// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PitPaidOperations} from "../src/PitPaidOperations.sol";
import {PitPaidBase} from "../src/PitPaidBase.sol";
import {PitMockUSDC} from "../src/PitMockUSDC.sol";
import {PitStandardToken} from "../src/PitTokens.sol";

contract PitPaidHandler {
    PitMockUSDC public immutable usdc;
    PitStandardToken public immutable asset;
    PitPaidOperations public immutable paid;
    address public constant MERCHANT = address(0xFEE);
    address public constant RECIPIENT = address(0xB0B);
    uint256 public calls;
    uint256 public successes;
    uint256 public failedAttempts;
    uint256 public lastIntent;

    constructor() {
        usdc = new PitMockUSDC(address(this));
        asset = new PitStandardToken("Asset", "AST", 10_000 ether, address(this));
        PitPaidBase.Prices memory prices = PitPaidBase.Prices(49e6, 149e6, 3e6, 100_000, 49e6, 39e6, 79e6);
        paid = new PitPaidOperations(usdc, MERCHANT, address(this), prices);
        usdc.approve(address(paid), type(uint256).max);
        asset.approve(address(paid), type(uint256).max);
    }

    function attempt(uint32 seed) external {
        ++calls;
        uint256 nonce = calls;
        bytes32 intent = bytes32(nonce);
        address[] memory recipients = new address[](1); recipients[0] = RECIPIENT;
        uint256[] memory amounts = new uint256[](1); amounts[0] = 1 ether;
        uint256 fee = seed % 4 == 0 ? 3e6 : 3_100_000; // One quarter deliberately underquotes.
        PitPaidBase.Quote memory quote = PitPaidBase.Quote(intent, paid.priceVersion(), fee, uint64(block.timestamp + 100));
        try paid.multiSend(asset, recipients, amounts, quote) {
            ++successes; lastIntent = nonce;
        } catch { ++failedAttempts; }
    }
}

contract PitPaidInvariantTest {
    PitPaidHandler internal handler;
    address[] private targets;
    function setUp() public { handler = new PitPaidHandler(); targets.push(address(handler)); }
    function targetContracts() public view returns (address[] memory) { return targets; }
    function invariant_FeeAndAssetConservation() public view {
        PitMockUSDC usdc = handler.usdc();
        PitStandardToken asset = handler.asset();
        PitPaidOperations paid = handler.paid();
        uint256 count = handler.successes();
        require(usdc.balanceOf(handler.MERCHANT()) == count * 3_100_000, "merchant fee mismatch");
        require(usdc.balanceOf(address(handler)) + usdc.balanceOf(handler.MERCHANT()) == usdc.totalSupply(), "payment supply mismatch");
        require(usdc.balanceOf(address(paid)) == 0, "router retained payment token");
        require(asset.balanceOf(handler.RECIPIENT()) == count * 1 ether, "recipient amount mismatch");
        require(asset.balanceOf(address(handler)) + asset.balanceOf(handler.RECIPIENT()) == asset.totalSupply(), "asset supply mismatch");
        require(asset.balanceOf(address(paid)) == 0, "router retained asset");
        if (count > 0) require(paid.usedIntent(address(handler), bytes32(handler.lastIntent())), "successful intent not marked");
    }
    function afterInvariant() public view { require(handler.calls() > 0 && handler.failedAttempts() > 0 && handler.successes() > 0, "state transitions not exercised"); }
}
