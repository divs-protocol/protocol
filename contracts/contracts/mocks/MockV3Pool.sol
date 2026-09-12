// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV3SwapCallback {
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external;
}

/// @notice Constant-price stand-in for a Uniswap V3 pool, for tests only.
///
/// @dev Reproduces the parts of the real pool the router depends on: the token
/// ordering, the sign convention on the deltas (positive is owed to the pool,
/// negative is paid out), and the callback for payment after the output has
/// been sent. Price is fixed so a test can assert exact amounts.
contract MockV3Pool {
    address public token0;
    address public token1;

    /// @dev token1 out per 1e18 of token0 in.
    uint256 public rate;

    constructor(address _token0, address _token1, uint256 _rate) {
        (token0, token1) = _token0 < _token1 ? (_token0, _token1) : (_token1, _token0);
        rate = _rate;
    }

    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1) {
        require(amountSpecified > 0, "Exact input only");
        uint256 amountIn = uint256(amountSpecified);
        uint256 amountOut = zeroForOne ? (amountIn * rate) / 1e18 : (amountIn * 1e18) / rate;

        if (zeroForOne) {
            amount0 = int256(amountIn);
            amount1 = -int256(amountOut);
            IERC20(token1).transfer(recipient, amountOut);
        } else {
            amount1 = int256(amountIn);
            amount0 = -int256(amountOut);
            IERC20(token0).transfer(recipient, amountOut);
        }

        IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
    }
}
