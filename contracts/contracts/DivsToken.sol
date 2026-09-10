// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title DIVS
/// @notice The protocol's cash-flow token. Stake it to earn a share of the
/// trading fees the platform collects.
///
/// @dev Deliberately minimal, and the omissions are the point:
///
/// - There is no mint function. The entire supply is created in the constructor
///   and can never be increased, so no key can dilute holders.
/// - There is no owner, pause, blacklist or fee-on-transfer hook. Nothing about
///   a transfer can be changed after deployment.
/// - `ERC20Permit` lets a holder approve by signature, so staking is one
///   signature rather than an approve transaction followed by a stake.
/// - `ERC20Burnable` only ever burns the caller's own balance (or an allowance
///   they granted), which is what a future buyback would need. It confers no
///   privilege on anyone.
contract DivsToken is ERC20, ERC20Permit, ERC20Burnable {
    /// @notice Total supply, fixed at deployment. One billion, 18 decimals.
    uint256 public constant MAX_SUPPLY = 1_000_000_000e18;

    constructor(address recipient) ERC20("DIVS Protocol", "DIVS") ERC20Permit("DIVS Protocol") {
        require(recipient != address(0), "Zero recipient");
        _mint(recipient, MAX_SUPPLY);
    }
}
