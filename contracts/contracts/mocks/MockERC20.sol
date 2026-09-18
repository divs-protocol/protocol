// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Plain ERC20 with open minting, for tests only.
contract MockERC20 is ERC20 {
    uint8 private _decimals = 18;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev USDG carries six, and a quote asset that is not eighteen is exactly
    /// the case the router has to get right.
    function setDecimals(uint8 d) external {
        _decimals = d;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
