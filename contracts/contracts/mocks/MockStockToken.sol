// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC8056} from "../DivsVault.sol";

/// @notice Minimal rebasing ERC-8056 stock token for tests.
/// @dev Balances are stored as shares; `balanceOf` reports shares scaled by
/// `uiMultiplier`, so every holder's balance grows when the multiplier grows.
/// This is the assumption DivsVault's accounting depends on: the vault pays
/// yield out of its own token balance, which is only solvent if that balance
/// actually rebases upward.
contract MockStockToken is IERC20, IERC8056 {
    string public constant name = "Mock Stock Token";
    string public constant symbol = "MSTK";
    uint8 public constant decimals = 18;

    uint256 public uiMultiplier;

    uint256 private _totalShares;
    mapping(address => uint256) private _shares;
    mapping(address => mapping(address => uint256)) private _allowances;

    constructor(uint256 initialMultiplier) {
        require(initialMultiplier > 0, "Multiplier must be positive");
        uiMultiplier = initialMultiplier;
    }

    // --- Test hooks ---

    /// @notice Simulates a dividend/rebase by moving the UI multiplier.
    function setMultiplier(uint256 newMultiplier) external {
        require(newMultiplier > 0, "Multiplier must be positive");
        uiMultiplier = newMultiplier;
    }

    function mint(address to, uint256 amount) external {
        uint256 shares = _toShares(amount);
        _totalShares += shares;
        _shares[to] += shares;
        emit Transfer(address(0), to, amount);
    }

    /// @notice Shares are the rebase-invariant unit; useful for solvency assertions.
    function sharesOf(address account) external view returns (uint256) {
        return _shares[account];
    }

    // --- Conversions ---

    function _toShares(uint256 amount) internal view returns (uint256) {
        return (amount * 1e18) / uiMultiplier;
    }

    function _toAmount(uint256 shares) internal view returns (uint256) {
        return (shares * uiMultiplier) / 1e18;
    }

    // --- ERC20 ---

    function totalSupply() external view returns (uint256) {
        return _toAmount(_totalShares);
    }

    function balanceOf(address account) public view returns (uint256) {
        return _toAmount(_shares[account]);
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = _allowances[from][msg.sender];
        require(allowed >= amount, "Insufficient allowance");
        if (allowed != type(uint256).max) {
            _allowances[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        uint256 shares = _toShares(amount);
        require(_shares[from] >= shares, "Insufficient balance");
        _shares[from] -= shares;
        _shares[to] += shares;
        emit Transfer(from, to, amount);
    }
}
