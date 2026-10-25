// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract PitStandardToken is ERC20 {
    error InvalidConfiguration();

    constructor(string memory name_, string memory symbol_, uint256 supply_, address recipient_)
        ERC20(name_, symbol_)
    {
        if (bytes(name_).length == 0 || bytes(symbol_).length == 0 || supply_ == 0 || recipient_ == address(0)) {
            revert InvalidConfiguration();
        }
        _mint(recipient_, supply_);
    }
}

contract PitAdvancedToken is ERC20, ERC20Burnable, ERC20Capped, ERC20Pausable, AccessControl {
    error InvalidConfiguration();
    error FeatureDisabled();

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bool public immutable mintingEnabled;
    bool public immutable burningEnabled;
    bool public immutable pausingEnabled;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        uint256 cap_,
        address recipient_,
        address administrator_,
        bool minting_,
        bool burning_,
        bool pausing_
    ) ERC20(name_, symbol_) ERC20Capped(cap_) {
        if (
            bytes(name_).length == 0 || bytes(symbol_).length == 0 || supply_ == 0 || cap_ < supply_
                || recipient_ == address(0) || administrator_ == address(0)
        ) revert InvalidConfiguration();
        mintingEnabled = minting_;
        burningEnabled = burning_;
        pausingEnabled = pausing_;
        _grantRole(DEFAULT_ADMIN_ROLE, administrator_);
        if (minting_) _grantRole(MINTER_ROLE, administrator_);
        if (pausing_) _grantRole(PAUSER_ROLE, administrator_);
        _mint(recipient_, supply_);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (!mintingEnabled) revert FeatureDisabled();
        _mint(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        if (!pausingEnabled) revert FeatureDisabled();
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        if (!pausingEnabled) revert FeatureDisabled();
        _unpause();
    }

    function burn(uint256 amount) public override {
        if (!burningEnabled) revert FeatureDisabled();
        super.burn(amount);
    }

    function burnFrom(address account, uint256 amount) public override {
        if (!burningEnabled) revert FeatureDisabled();
        super.burnFrom(account, amount);
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Capped, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}

contract PitTokenFactory {
    event TokenCreated(address indexed creator, address indexed token, bool advanced);

    function createStandard(string calldata name_, string calldata symbol_, uint256 supply_, address recipient_)
        external
        returns (address token)
    {
        token = address(new PitStandardToken(name_, symbol_, supply_, recipient_));
        emit TokenCreated(msg.sender, token, false);
    }

    function createAdvanced(
        string calldata name_, string calldata symbol_, uint256 supply_, uint256 cap_, address recipient_,
        bool minting_, bool burning_, bool pausing_
    ) external returns (address token) {
        token = address(new PitAdvancedToken(
            name_, symbol_, supply_, cap_, recipient_, msg.sender, minting_, burning_, pausing_
        ));
        emit TokenCreated(msg.sender, token, true);
    }
}
