// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC8056 {
    function uiMultiplier() external view returns (uint256);
}

/// @title DivsVault
/// @notice Holds rebasing ERC-8056 stock tokens and strips the dividend growth
/// (the rise in `uiMultiplier`) into a harvestable yield, minus a protocol fee.
/// @dev Accounting invariant: a depositor's claim on the vault is always
/// `rawAmount * currentMultiplier / entryMultiplier`. `rawAmount` is denominated
/// in token units as of `entryMultiplier`, never in raw display units, so every
/// conversion in and out of the vault must be scaled through that ratio.
contract DivsVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct DepositInfo {
        uint256 rawAmount;
        uint256 entryMultiplier;
    }

    /// @notice stockToken => user => position.
    mapping(address => mapping(address => DepositInfo)) public deposits;

    address public feeCollector;
    uint256 public constant PROTOCOL_FEE_BPS = 300;

    event VaultDeposited(address indexed user, address indexed stockToken, uint256 amount, uint256 multiplier);
    event YieldHarvested(address indexed user, address indexed stockToken, uint256 yieldAmount, uint256 feeAmount);
    event VaultWithdrawn(address indexed user, address indexed stockToken, uint256 amount);
    event FeeCollectorUpdated(address indexed previousCollector, address indexed newCollector);

    constructor(address _feeCollector) Ownable(msg.sender) {
        require(_feeCollector != address(0), "Fee collector is zero address");
        feeCollector = _feeCollector;
        emit FeeCollectorUpdated(address(0), _feeCollector);
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Fee collector is zero address");
        address previousCollector = feeCollector;
        feeCollector = _feeCollector;
        emit FeeCollectorUpdated(previousCollector, _feeCollector);
    }

    function deposit(address stockToken, uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot deposit 0");
        uint256 currentMultiplier = IERC8056(stockToken).uiMultiplier();
        require(currentMultiplier > 0, "Invalid multiplier");

        // Credit what actually arrived, not what was requested. Rebasing tokens
        // floor the share conversion and fee-on-transfer tokens skim the amount;
        // crediting `amount` in either case leaves the vault permanently short,
        // and the gap is amplified by every subsequent rebase.
        uint256 balanceBefore = IERC20(stockToken).balanceOf(address(this));
        IERC20(stockToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(stockToken).balanceOf(address(this)) - balanceBefore;
        require(received > 0, "No tokens received");

        DepositInfo storage info = deposits[stockToken][msg.sender];

        if (info.rawAmount > 0) {
            _harvest(stockToken, msg.sender);
        } else {
            info.entryMultiplier = currentMultiplier;
        }

        // Normalise into entry-multiplier units. A harvest leaves
        // `entryMultiplier == currentMultiplier`, so this is an identity except
        // after a downward rebase, where the same tokens buy proportionally more
        // entry-denominated principal.
        uint256 credited = (received * info.entryMultiplier) / currentMultiplier;
        require(credited > 0, "Deposit too small");

        info.rawAmount += credited;
        emit VaultDeposited(msg.sender, stockToken, received, currentMultiplier);
    }

    /// @notice The depositor's total claim on the vault, in current token units.
    function positionValue(address stockToken, address user) public view returns (uint256) {
        DepositInfo memory info = deposits[stockToken][user];
        if (info.rawAmount == 0) return 0;

        uint256 currentMultiplier = IERC8056(stockToken).uiMultiplier();
        return (info.rawAmount * currentMultiplier) / info.entryMultiplier;
    }

    /// @dev `rawAmount` is denominated in token units as of `entryMultiplier`, so the
    /// proportional gain is scaled by the entry multiplier, not by a fixed 1e18.
    function pendingYield(address stockToken, address user) public view returns (uint256) {
        DepositInfo memory info = deposits[stockToken][user];
        if (info.rawAmount == 0) return 0;

        uint256 currentMultiplier = IERC8056(stockToken).uiMultiplier();
        if (currentMultiplier <= info.entryMultiplier) return 0;

        uint256 multiplierDiff = currentMultiplier - info.entryMultiplier;
        return (info.rawAmount * multiplierDiff) / info.entryMultiplier;
    }

    function _harvest(address stockToken, address user) internal {
        uint256 yieldAmount = pendingYield(stockToken, user);
        if (yieldAmount == 0) return;

        DepositInfo storage info = deposits[stockToken][user];
        info.entryMultiplier = IERC8056(stockToken).uiMultiplier();

        uint256 fee = (yieldAmount * PROTOCOL_FEE_BPS) / 10000;
        uint256 userPayout = yieldAmount - fee;

        if (fee > 0) {
            IERC20(stockToken).safeTransfer(feeCollector, fee);
        }

        IERC20(stockToken).safeTransfer(user, userPayout);
        emit YieldHarvested(user, stockToken, userPayout, fee);
    }

    function harvest(address stockToken) external nonReentrant {
        _harvest(stockToken, msg.sender);
    }

    function withdraw(address stockToken) external nonReentrant {
        require(deposits[stockToken][msg.sender].rawAmount > 0, "No active deposit");

        _harvest(stockToken, msg.sender);

        // Re-read after harvesting: `_harvest` advances `entryMultiplier`.
        DepositInfo memory info = deposits[stockToken][msg.sender];
        uint256 currentMultiplier = IERC8056(stockToken).uiMultiplier();

        // Scale the principal to the live multiplier. Upside has already been
        // stripped by the harvest above, so this only bites after a downward
        // rebase, where the loss must fall on this depositor rather than being
        // socialised onto everyone else's principal.
        uint256 amountToWithdraw = (info.rawAmount * currentMultiplier) / info.entryMultiplier;

        delete deposits[stockToken][msg.sender];

        IERC20(stockToken).safeTransfer(msg.sender, amountToWithdraw);
        emit VaultWithdrawn(msg.sender, stockToken, amountToWithdraw);
    }
}
