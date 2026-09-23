// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice Constant-price stand-in for the V4 singleton, for tests only.
///
/// @dev The real `PoolManager.sol` pins an exact `pragma solidity 0.8.26`,
/// which conflicts with the `transient` storage the router's V3 callback
/// guard needs (added in 0.8.28), so the two cannot share one compiler run.
/// This reproduces only what the router actually depends on: `unlock`
/// calling back into the caller mid-transaction, `swap` returning a signed
/// `BalanceDelta` per currency, and the sync/transfer/settle and take
/// mechanics settlement uses instead of a callback payment. Price is fixed
/// per pool so a test can assert exact amounts, the same trade-off
/// `MockV3Pool` makes for V3.
contract MockPoolManager {
    using PoolIdLibrary for PoolKey;

    /// @dev currency1 out per 1e18 of currency0 in, per pool. Reserves live
    /// as this contract's own token balances, seeded with a plain mint - a
    /// swap pays out of them directly, the same as `MockV3Pool`.
    mapping(PoolId => uint256) public rate;

    function setRate(PoolKey calldata key, uint256 r) external {
        rate[key.toId()] = r;
    }

    function unlock(bytes calldata data) external returns (bytes memory) {
        return IUnlockCallback(msg.sender).unlockCallback(data);
    }

    function swap(PoolKey memory key, SwapParams memory params, bytes calldata)
        external
        view
        returns (BalanceDelta delta)
    {
        require(params.amountSpecified < 0, "Exact input only");
        uint256 amountIn = uint256(-params.amountSpecified);
        uint256 r = rate[key.toId()];
        require(r > 0, "No pool");

        uint256 amountOut = params.zeroForOne ? (amountIn * r) / 1e18 : (amountIn * 1e18) / r;

        // Negative: the router owes the pool. Positive: the pool owes the
        // router. Exactly one side of each swap is negative.
        int128 delta0 = params.zeroForOne ? -int128(int256(amountIn)) : int128(int256(amountOut));
        int128 delta1 = params.zeroForOne ? int128(int256(amountOut)) : -int128(int256(amountIn));
        delta = toBalanceDelta(delta0, delta1);
    }

    /// @dev The real PoolManager records a balance snapshot here so `settle`
    /// can measure what arrived since. This mock trusts the router's own
    /// transfer instead, so there is nothing to record.
    function sync(Currency) external {}

    function settle() external payable returns (uint256) {
        return 0;
    }

    function take(Currency currency, address to, uint256 amount) external {
        IERC20(Currency.unwrap(currency)).transfer(to, amount);
    }
}
