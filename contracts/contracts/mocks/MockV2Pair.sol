// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal stand-in for a Uniswap V2 pair, for tests only.
///
/// @dev Reproduces the part of V2 the router depends on: no callback, the
/// caller pays by transferring the input token to the pair before calling
/// `swap`, and the pair sends the output straight out. Reserves are read live
/// off the pair's own balances rather than cached, so seeding one is a plain
/// mint with no separate sync step.
contract MockV2Pair {
    address public token0;
    address public token1;

    constructor(address _token0, address _token1) {
        (token0, token1) = _token0 < _token1 ? (_token0, _token1) : (_token1, _token0);
    }

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
        reserve0 = uint112(IERC20(token0).balanceOf(address(this)));
        reserve1 = uint112(IERC20(token1).balanceOf(address(this)));
        blockTimestampLast = uint32(block.timestamp);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external {
        require(amount0Out == 0 || amount1Out == 0, "One side only");
        if (amount0Out > 0) IERC20(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).transfer(to, amount1Out);
    }
}
