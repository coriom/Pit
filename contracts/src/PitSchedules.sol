// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice One ERC-20 lock with immutable beneficiary and no privileged early release.
contract PitTokenLock is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable beneficiary;
    uint64 public immutable unlockTime;
    uint256 public deposited;
    uint256 public released;
    error InvalidLock();
    error UnsupportedToken();
    event Funded(address indexed funder, uint256 amount);
    event Released(address indexed beneficiary, uint256 amount);

    constructor(IERC20 token_, address beneficiary_, uint64 unlockTime_) {
        if (address(token_) == address(0) || beneficiary_ == address(0) || unlockTime_ <= block.timestamp) {
            revert InvalidLock();
        }
        token = token_;
        beneficiary = beneficiary_;
        unlockTime = unlockTime_;
    }

    function fund(uint256 amount) external nonReentrant {
        if (amount == 0 || block.timestamp >= unlockTime) revert InvalidLock();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedToken();
        deposited += amount;
        emit Funded(msg.sender, amount);
    }

    function release() external nonReentrant returns (uint256 amount) {
        if (msg.sender != beneficiary || block.timestamp < unlockTime) revert InvalidLock();
        amount = deposited - released;
        if (amount == 0) revert InvalidLock();
        released = deposited;
        uint256 beforeBalance = token.balanceOf(beneficiary);
        token.safeTransfer(beneficiary, amount);
        if (token.balanceOf(beneficiary) != beforeBalance + amount) revert UnsupportedToken();
        emit Released(beneficiary, amount);
    }
}

/// @notice One fully funded, immutable linear ERC-20 schedule; no late top-ups.
contract PitTokenVesting is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable beneficiary;
    uint64 public immutable start;
    uint64 public immutable duration;
    uint64 public immutable cliff;
    uint256 public immutable allocation;
    bool public funded;
    uint256 public released;
    error InvalidSchedule();
    error UnsupportedToken();
    event Funded(address indexed funder, uint256 amount);
    event Released(address indexed beneficiary, uint256 amount);

    constructor(IERC20 token_, address beneficiary_, uint64 start_, uint64 duration_, uint64 cliff_, uint256 allocation_) {
        if (
            address(token_) == address(0) || beneficiary_ == address(0) || start_ <= block.timestamp
                || duration_ == 0 || allocation_ == 0 || cliff_ < start_ || cliff_ > start_ + duration_
        ) revert InvalidSchedule();
        token = token_;
        beneficiary = beneficiary_;
        start = start_;
        duration = duration_;
        cliff = cliff_;
        allocation = allocation_;
    }

    function fund() external nonReentrant {
        if (funded || block.timestamp >= start) revert InvalidSchedule();
        funded = true;
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), allocation);
        if (token.balanceOf(address(this)) != beforeBalance + allocation) revert UnsupportedToken();
        emit Funded(msg.sender, allocation);
    }

    function vestedAt(uint64 timestamp) public view returns (uint256) {
        if (!funded || timestamp < cliff) return 0;
        if (timestamp >= start + duration) return allocation;
        return Math.mulDiv(allocation, timestamp - start, duration);
    }

    function releasable() public view returns (uint256) {
        return vestedAt(uint64(block.timestamp)) - released;
    }

    function release() external nonReentrant returns (uint256 amount) {
        if (msg.sender != beneficiary) revert InvalidSchedule();
        amount = releasable();
        if (amount == 0) revert InvalidSchedule();
        released += amount;
        uint256 beforeBalance = token.balanceOf(beneficiary);
        token.safeTransfer(beneficiary, amount);
        if (token.balanceOf(beneficiary) != beforeBalance + amount) revert UnsupportedToken();
        emit Released(beneficiary, amount);
    }
}
