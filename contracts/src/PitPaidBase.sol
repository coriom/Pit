// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Shared local fee and replay rules. Separate entry points keep deployable bytecode under EIP-170.
abstract contract PitPaidBase is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant MAX_RECIPIENTS = 100;
    uint256 public constant MAX_FEE = 1_000_000_000;
    bytes32 public constant STANDARD = keccak256("PIT_STANDARD_V1");
    bytes32 public constant ADVANCED = keccak256("PIT_ADVANCED_V1");
    bytes32 public constant MULTISEND = keccak256("PIT_MULTISEND_V1");
    bytes32 public constant LOCK = keccak256("PIT_LOCK_V1");
    bytes32 public constant VESTING = keccak256("PIT_VESTING_V1");
    struct Prices {
        uint256 standard; uint256 advanced; uint256 multiBase; uint256 multiPerRecipient;
        uint256 multiCap; uint256 lockFee; uint256 vestingFee;
    }
    struct Quote { bytes32 intentId; uint256 version; uint256 maxFee; uint64 deadline; }
    IERC20 public immutable paymentToken;
    address public immutable feeRecipient;
    uint256 public priceVersion = 1;
    Prices public prices;
    mapping(address => mapping(bytes32 => bool)) public usedIntent;
    error InvalidConfiguration();
    error InvalidQuote();
    error InvalidBatch();
    error UnsupportedToken();
    event PricesUpdated(uint256 indexed version);
    event FeePaid(address indexed payer, bytes32 indexed operation, bytes32 indexed intentId, address recipient, uint256 amount);
    event OperationExecuted(address indexed payer, bytes32 indexed operation, bytes32 indexed intentId, bytes32 requestHash, address result);

    constructor(IERC20 paymentToken_, address feeRecipient_, address administrator_, Prices memory initialPrices)
        Ownable(administrator_)
    {
        if (address(paymentToken_) == address(0) || feeRecipient_ == address(0) || administrator_ == address(0)
            || feeRecipient_ == address(this) || IERC20Metadata(address(paymentToken_)).decimals() != 6) revert InvalidConfiguration();
        paymentToken = paymentToken_;
        feeRecipient = feeRecipient_;
        _setPrices(initialPrices);
    }

    function setPrices(Prices calldata next) external onlyOwner {
        _setPrices(next);
        ++priceVersion;
        emit PricesUpdated(priceVersion);
    }
    function _setPrices(Prices memory next) private {
        if (next.standard == 0 || next.advanced == 0 || next.multiBase == 0 || next.multiPerRecipient == 0
            || next.multiCap < next.multiBase || next.lockFee == 0 || next.vestingFee == 0
            || next.standard > MAX_FEE || next.advanced > MAX_FEE || next.multiBase > MAX_FEE
            || next.multiPerRecipient > MAX_FEE || next.multiCap > MAX_FEE
            || next.lockFee > MAX_FEE || next.vestingFee > MAX_FEE) revert InvalidConfiguration();
        prices = next;
    }
    function multiFee(uint256 recipients) public view returns (uint256) {
        if (recipients == 0 || recipients > MAX_RECIPIENTS) revert InvalidBatch();
        uint256 fee = prices.multiBase + prices.multiPerRecipient * recipients;
        return fee > prices.multiCap ? prices.multiCap : fee;
    }
    function _charge(bytes32 operation, Quote calldata quote, uint256 amount) internal {
        if (quote.intentId == bytes32(0) || usedIntent[msg.sender][quote.intentId] || quote.version != priceVersion
            || amount == 0 || amount > quote.maxFee || quote.deadline < block.timestamp || quote.deadline > block.timestamp + 1 days
            || msg.sender == feeRecipient) revert InvalidQuote();
        usedIntent[msg.sender][quote.intentId] = true;
        uint256 payerBefore = paymentToken.balanceOf(msg.sender);
        uint256 recipientBefore = paymentToken.balanceOf(feeRecipient);
        paymentToken.safeTransferFrom(msg.sender, feeRecipient, amount);
        if (paymentToken.balanceOf(msg.sender) != payerBefore - amount
            || paymentToken.balanceOf(feeRecipient) != recipientBefore + amount) revert UnsupportedToken();
        emit FeePaid(msg.sender, operation, quote.intentId, feeRecipient, amount);
    }
}
