// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PitStandardToken, PitAdvancedToken} from "../src/PitTokens.sol";
import {PitTokenLock, PitTokenVesting} from "../src/PitSchedules.sol";

interface VmInvariant {
    function warp(uint256) external;
}

contract SupplyHandler {
    PitStandardToken public immutable fixedToken;
    PitAdvancedToken public immutable advancedToken;
    uint256 public calls;

    constructor() {
        fixedToken = new PitStandardToken("Fixed", "FIX", 1000, address(this));
        advancedToken = new PitAdvancedToken("Capped", "CAP", 100, 1000, address(this), address(this), true, true, false);
    }

    function mint(uint96 seed) external {
        ++calls;
        uint256 available = advancedToken.cap() - advancedToken.totalSupply();
        uint256 amount = uint256(seed) % (available + 1);
        if (amount != 0) advancedToken.mint(address(this), amount);
    }

    function burn(uint96 seed) external {
        ++calls;
        uint256 balance = advancedToken.balanceOf(address(this));
        uint256 amount = uint256(seed) % (balance + 1);
        if (amount != 0) advancedToken.burn(amount);
    }

    function moveFixed(uint96 seed) external {
        ++calls;
        uint256 balance = fixedToken.balanceOf(address(this));
        uint256 amount = uint256(seed) % (balance + 1);
        if (amount != 0) require(fixedToken.transfer(address(0xB0B), amount), "fixed transfer");
    }
}

contract SupplyInvariantTest {
    SupplyHandler internal handler;
    address[] private targets;

    function setUp() public {
        handler = new SupplyHandler();
        targets.push(address(handler));
    }

    function targetContracts() public view returns (address[] memory) { return targets; }

    function invariant_SupplyBoundAndFixedSupply() public view {
        require(handler.fixedToken().totalSupply() == 1000, "fixed supply changed");
        require(handler.advancedToken().totalSupply() <= handler.advancedToken().cap(), "cap exceeded");
        require(!handler.advancedToken().hasRole(handler.advancedToken().DEFAULT_ADMIN_ROLE(), address(this)), "test admin");
    }

    function afterInvariant() public view { require(handler.calls() > 0, "handler not exercised"); }
}

contract ScheduleHandler {
    VmInvariant internal constant VM = VmInvariant(address(uint160(uint256(keccak256("hevm cheat code")))));
    PitStandardToken public immutable token;
    PitTokenLock public immutable lock;
    PitTokenVesting public immutable vest;
    uint256 public calls;

    constructor() {
        token = new PitStandardToken("Schedule", "SCH", 1000, address(this));
        lock = new PitTokenLock(token, address(this), 1100);
        vest = new PitTokenVesting(token, address(this), 1100, 100, 1125, 101);
        token.approve(address(lock), 1000);
        token.approve(address(vest), 101);
        lock.fund(100);
        vest.fund();
    }

    function advance(uint32 seed) external {
        ++calls;
        VM.warp(block.timestamp + uint256(seed % 201));
    }

    function addToLock(uint32 seed) external {
        ++calls;
        uint256 balance = token.balanceOf(address(this));
        uint256 amount = uint256(seed) % (balance + 1);
        if (amount != 0 && block.timestamp < 1100) lock.fund(amount);
    }

    function releaseLock() external {
        ++calls;
        if (block.timestamp >= 1100 && lock.deposited() > lock.released()) lock.release();
    }

    function releaseVesting() external {
        ++calls;
        if (vest.releasable() != 0) vest.release();
    }
}

contract ScheduleInvariantTest {
    VmInvariant internal constant VM = VmInvariant(address(uint160(uint256(keccak256("hevm cheat code")))));
    ScheduleHandler internal handler;
    address[] private targets;

    function setUp() public {
        VM.warp(1000);
        handler = new ScheduleHandler();
        targets.push(address(handler));
    }

    function targetContracts() public view returns (address[] memory) { return targets; }

    function invariant_FundedBalancesAndReleaseConservation() public view {
        PitStandardToken token = handler.token();
        PitTokenLock lock = handler.lock();
        PitTokenVesting vest = handler.vest();
        require(lock.released() <= lock.deposited(), "lock over-release");
        require(token.balanceOf(address(lock)) + lock.released() == lock.deposited(), "lock conservation");
        require(vest.released() <= vest.vestedAt(uint64(block.timestamp)), "early vesting release");
        require(token.balanceOf(address(vest)) + vest.released() == vest.allocation(), "vesting conservation");
    }

    function afterInvariant() public view { require(handler.calls() > 0, "handler not exercised"); }
}
