// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams as V4SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

interface IUniswapV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

/// @dev V2's swap has no callback - the caller pays by transferring the input
/// token to the pair before calling `swap`, and the pair sends the output
/// directly. `token0`/`token1` share IUniswapV3Pool's signatures exactly, so
/// `_quoteOf` and `_otherToken` work unchanged against a V2 pair.
interface IUniswapV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}

interface IWETH9 is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IDivsStaking {
    function notifyFee(uint256 amount) external;
}

/// @title DivsRouter
/// @notice Executes trades against the tokenized-equity pools and charges the
/// protocol fee that DivsStaking distributes.
///
/// @dev Markets are quoted in one of two assets. Most are paired against WETH,
/// but around sixty are paired against USDG, and refusing those would leave
/// more than half the listed markets unbuyable.
///
/// The fee is always taken on the quote side of the trade:
///
///   buying  - quote in, fee deducted before the swap, remainder swapped
///   selling - token in, swapped for quote, fee deducted from the proceeds
///
/// so the router never holds a stock token between trades. A USDG fee is
/// converted to WETH when fees are flushed, not per trade, because a swap on
/// every fill would cost more than the fee on a small one. The staking contract
/// therefore still only ever receives WETH, which is what its accounting
/// assumes.
///
/// Swaps are executed directly against each pool rather than through a periphery
/// router, which removes a deployment dependency and keeps the fee inside the
/// same call as the trade. The pool calls back for payment; `_callbackPool` is
/// set immediately before the swap and cleared after, so a callback from any
/// address other than the pool this contract just called reverts. It is
/// transient storage, so it cannot survive the transaction.
///
/// Fees accrue in the router and are pushed to staking once they pass
/// `flushThreshold`, rather than on every trade: a notify writes to the
/// accumulator, and charging every small swap for that makes trading expensive.
/// `flushFees` is permissionless, so a pending balance is never trapped.
///
/// Ownership transfers in two steps. The owner is intended to be a multisig,
/// and a single-step transfer to an address that cannot transact - wrong chain,
/// mistyped, not yet deployed - loses configuration control permanently. The
/// nominee has to call `acceptOwnership`, which proves it can act before it
/// gets to.
///
/// @dev V2 and V4 pools reach the same fee accrual as V3, through `_accrue`,
/// so one flush still empties the whole pot regardless of which venue earned
/// it.
///
/// V2 has no callback: the router transfers the input token to the pair
/// before calling `swap`, and the pair sends the output directly, so
/// `_swapV2` needs no reentrancy guard of its own beyond the function it is
/// called from.
///
/// V4 has no pools to call - one shared `PoolManager` is unlocked with
/// `unlock`, which calls back into `unlockCallback` inside the same
/// transaction. Unlike the V3 callback, the caller here is always the
/// `PoolManager` itself, a known immutable address, not an arbitrary pool, so
/// the guard is a plain `msg.sender` check rather than transient storage. A
/// pool's hook runs arbitrary code on every swap through it; hookless pools
/// are always reachable, a specific hook only once the owner allowlists it
/// with `setV4HookAllowed`.
contract DivsRouter is Ownable2Step, ReentrancyGuard, IUnlockCallback {
    using SafeERC20 for IERC20;

    /// @dev Uniswap V3 price bounds. Swapping to the limit means "no price
    /// limit"; protection is the caller's `amountOutMin` instead.
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    /// @notice Hard ceiling on the protocol fee, enforced in the setter. The
    /// owner can lower the fee at any time but can never exceed this.
    uint256 public constant MAX_FEE_BPS = 100; // 1%
    uint256 internal constant BPS = 10_000;

    IWETH9 public immutable weth;

    /// @notice The second quote asset. Six decimals, unlike WETH's eighteen.
    IERC20 public immutable usdg;

    /// @notice WETH/USDG pool, used to convert USDG fees before they are paid on.
    address public immutable usdgWethPool;

    /// @notice The V4 singleton. V4 trading reverts while this is unset.
    IPoolManager public immutable poolManager;

    /// @notice V4 pools whose hook the owner has reviewed and allowed. A
    /// hookless pool (`hooks == address(0)`) never needs an entry here.
    mapping(address => bool) public v4HookAllowed;

    /// @notice DivsStaking. Fees accrue in the router until this is set.
    address public staking;

    /// @notice Protocol fee in basis points, charged on the quote side.
    uint256 public feeBps;

    /// @notice WETH collected and not yet sent to staking.
    uint256 public pendingFees;

    /// @notice USDG collected and not yet converted to WETH.
    uint256 public pendingUsdgFees;

    /// @notice Pending WETH fees are pushed to staking once they reach this.
    uint256 public flushThreshold;

    /// @notice Pending USDG fees are converted and pushed once they reach this.
    /// Kept separate because a market quoted only in USDG would otherwise never
    /// reach the WETH threshold and its fees would sit here forever.
    uint256 public usdgFlushThreshold;

    address private transient _callbackPool;
    address private transient _callbackTokenIn;

    event Swapped(
        address indexed trader,
        address indexed pool,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );
    /// @dev V2 and V3 both identify a market by a deployed pool address and
    /// share the `Swapped` event above. V4 has no such address - a market is
    /// a `PoolId`, the hash of its key - so it gets its own event shape.
    event SwappedV4(
        address indexed trader,
        bytes32 indexed poolId,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );
    event FeesFlushed(uint256 amount);
    event FeeBpsUpdated(uint256 feeBps);
    event StakingUpdated(address staking);
    event FlushThresholdUpdated(uint256 threshold);
    event UsdgFlushThresholdUpdated(uint256 threshold);
    event UsdgFeesConverted(uint256 usdgIn, uint256 wethOut);
    event V4HookAllowedSet(address indexed hook, bool allowed);

    constructor(
        address _weth,
        address _usdg,
        address _usdgWethPool,
        address _staking,
        uint256 _feeBps,
        address _owner,
        address _poolManager
    ) Ownable(_owner) {
        require(_weth != address(0) && _usdg != address(0), "Zero token");
        require(_usdgWethPool != address(0), "Zero pool");
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        weth = IWETH9(_weth);
        usdg = IERC20(_usdg);
        usdgWethPool = _usdgWethPool;
        poolManager = IPoolManager(_poolManager);
        staking = _staking;
        feeBps = _feeBps;
        flushThreshold = 0.05 ether;
        // USDG carries six decimals, so this is one hundred dollars.
        usdgFlushThreshold = 100e6;
    }

    // --- trading -----------------------------------------------------------

    /// @notice Buy a stock token with the asset its market is quoted in.
    /// @param pool The market's pool.
    /// @param amountIn Quote asset to spend, fee included.
    /// @param amountOutMin Minimum tokens out, or the call reverts.
    /// @param recipient Who receives the tokens.
    function buy(address pool, uint256 amountIn, uint256 amountOutMin, address recipient)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Zero amount");
        address quote = _quoteOf(pool);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = _buy(pool, quote, amountIn, amountOutMin, recipient);
    }

    /// @notice Buy a stock token with native ETH, wrapped on the way in.
    function buyWithETH(address pool, uint256 amountOutMin, address recipient)
        external
        payable
        nonReentrant
        returns (uint256 amountOut)
    {
        require(msg.value > 0, "Zero amount");
        // A USDG pool cannot be paid in ether.
        require(_quoteOf(pool) == address(weth), "Not WETH quoted");
        weth.deposit{value: msg.value}();
        amountOut = _buy(pool, address(weth), msg.value, amountOutMin, recipient);
    }

    /// @notice Sell a stock token for WETH.
    /// @param amountIn Tokens to sell.
    /// @param amountOutMin Minimum WETH out after the fee.
    /// @param unwrap Deliver native ETH instead of WETH.
    function sell(
        address pool,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        bool unwrap
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Zero amount");
        address quote = _quoteOf(pool);
        address token = _otherToken(pool, quote);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountIn);

        // Proceeds land here so the fee can be taken before the payout.
        uint256 gross = _swap(pool, token, amountIn, address(this));
        uint256 fee = (gross * feeBps) / BPS;
        amountOut = gross - fee;
        require(amountOut >= amountOutMin, "Too little received");

        _accrue(quote, fee);

        if (unwrap) {
            require(quote == address(weth), "Not WETH quoted");
            weth.withdraw(amountOut);
            (bool ok,) = recipient.call{value: amountOut}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(quote).safeTransfer(recipient, amountOut);
        }

        emit Swapped(msg.sender, pool, token, amountIn, amountOut, fee);
    }

    // --- V2 trading ----------------------------------------------------

    /// @notice Buy a stock token from a V2 pair.
    /// @param pair The market's pair.
    function buyV2(address pair, uint256 amountIn, uint256 amountOutMin, address recipient)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Zero amount");
        address quote = _quoteOf(pair);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = _buyV2(pair, quote, amountIn, amountOutMin, recipient);
    }

    /// @notice Buy from a V2 pair with native ETH, wrapped on the way in.
    function buyWithETHV2(address pair, uint256 amountOutMin, address recipient)
        external
        payable
        nonReentrant
        returns (uint256 amountOut)
    {
        require(msg.value > 0, "Zero amount");
        require(_quoteOf(pair) == address(weth), "Not WETH quoted");
        weth.deposit{value: msg.value}();
        amountOut = _buyV2(pair, address(weth), msg.value, amountOutMin, recipient);
    }

    /// @notice Sell a stock token into a V2 pair for WETH.
    function sellV2(
        address pair,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        bool unwrap
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Zero amount");
        address quote = _quoteOf(pair);
        address token = _otherToken(pair, quote);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountIn);

        // Proceeds land here so the fee can be taken before the payout.
        uint256 gross = _swapV2(pair, token, amountIn, address(this));
        uint256 fee = (gross * feeBps) / BPS;
        amountOut = gross - fee;
        require(amountOut >= amountOutMin, "Too little received");

        _accrue(quote, fee);

        if (unwrap) {
            require(quote == address(weth), "Not WETH quoted");
            weth.withdraw(amountOut);
            (bool ok,) = recipient.call{value: amountOut}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(quote).safeTransfer(recipient, amountOut);
        }

        emit Swapped(msg.sender, pair, token, amountIn, amountOut, fee);
    }

    /// @dev The quote asset is already held by this contract when called.
    function _buyV2(
        address pair,
        address quote,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient
    ) internal returns (uint256 amountOut) {
        uint256 fee = (amountIn * feeBps) / BPS;
        _accrue(quote, fee);

        amountOut = _swapV2(pair, quote, amountIn - fee, recipient);
        require(amountOut >= amountOutMin, "Too little received");

        emit Swapped(msg.sender, pair, quote, amountIn, amountOut, fee);
    }

    // --- V4 trading ----------------------------------------------------

    /// @notice Buy a stock token from a V4 pool.
    /// @param key The pool's key. V4 has no deployed pool contract to name.
    function buyV4(PoolKey calldata key, uint256 amountIn, uint256 amountOutMin, address recipient)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        require(address(poolManager) != address(0), "V4 unset");
        require(amountIn > 0, "Zero amount");
        _checkHook(key.hooks);
        address quote = _quoteOfV4(key);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 fee = (amountIn * feeBps) / BPS;
        _accrue(quote, fee);

        bool zeroForOne = Currency.unwrap(key.currency0) == quote;
        amountOut = _swapV4(key, zeroForOne, amountIn - fee, recipient);
        require(amountOut >= amountOutMin, "Too little received");

        emit SwappedV4(msg.sender, PoolId.unwrap(key.toId()), quote, amountIn, amountOut, fee);
    }

    /// @notice Buy from a V4 pool with native ETH, wrapped on the way in.
    function buyWithETHV4(PoolKey calldata key, uint256 amountOutMin, address recipient)
        external
        payable
        nonReentrant
        returns (uint256 amountOut)
    {
        require(address(poolManager) != address(0), "V4 unset");
        require(msg.value > 0, "Zero amount");
        _checkHook(key.hooks);
        require(_quoteOfV4(key) == address(weth), "Not WETH quoted");
        weth.deposit{value: msg.value}();

        uint256 fee = (msg.value * feeBps) / BPS;
        _accrue(address(weth), fee);

        bool zeroForOne = Currency.unwrap(key.currency0) == address(weth);
        amountOut = _swapV4(key, zeroForOne, msg.value - fee, recipient);
        require(amountOut >= amountOutMin, "Too little received");

        emit SwappedV4(msg.sender, PoolId.unwrap(key.toId()), address(weth), msg.value, amountOut, fee);
    }

    /// @notice Sell a stock token into a V4 pool for WETH.
    function sellV4(
        PoolKey calldata key,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        bool unwrap
    ) external nonReentrant returns (uint256 amountOut) {
        require(address(poolManager) != address(0), "V4 unset");
        require(amountIn > 0, "Zero amount");
        _checkHook(key.hooks);
        address quote = _quoteOfV4(key);
        address token = _otherTokenV4(key, quote);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountIn);

        bool zeroForOne = Currency.unwrap(key.currency0) == token;
        uint256 gross = _swapV4(key, zeroForOne, amountIn, address(this));
        uint256 fee = (gross * feeBps) / BPS;
        amountOut = gross - fee;
        require(amountOut >= amountOutMin, "Too little received");

        _accrue(quote, fee);

        if (unwrap) {
            require(quote == address(weth), "Not WETH quoted");
            weth.withdraw(amountOut);
            (bool ok,) = recipient.call{value: amountOut}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(quote).safeTransfer(recipient, amountOut);
        }

        emit SwappedV4(msg.sender, PoolId.unwrap(key.toId()), token, amountIn, amountOut, fee);
    }

    /// @dev The quote asset is already held by this contract when called.
    function _buy(
        address pool,
        address quote,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient
    ) internal returns (uint256 amountOut) {
        uint256 fee = (amountIn * feeBps) / BPS;
        _accrue(quote, fee);

        amountOut = _swap(pool, quote, amountIn - fee, recipient);
        require(amountOut >= amountOutMin, "Too little received");

        emit Swapped(msg.sender, pool, quote, amountIn, amountOut, fee);
    }

    /// @dev Executes the swap and returns the output amount.
    function _swap(address pool, address tokenIn, uint256 amountIn, address recipient)
        internal
        returns (uint256 amountOut)
    {
        bool zeroForOne = IUniswapV3Pool(pool).token0() == tokenIn;

        _callbackPool = pool;
        _callbackTokenIn = tokenIn;

        (int256 amount0, int256 amount1) = IUniswapV3Pool(pool).swap(
            recipient,
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            ""
        );

        _callbackPool = address(0);
        _callbackTokenIn = address(0);

        // The pool reports what it sent as a negative delta.
        int256 out = zeroForOne ? -amount1 : -amount0;
        require(out > 0, "No output");
        amountOut = uint256(out);
    }

    /// @notice Uniswap V3 payment callback.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        require(msg.sender == _callbackPool, "Unexpected callback");
        uint256 owed = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        IERC20(_callbackTokenIn).safeTransfer(msg.sender, owed);
    }

    /// @dev Which asset a pool prices its token against. Reverts for a pair
    /// this contract cannot take a fee in, rather than guessing at one.
    function _quoteOf(address pool) internal view returns (address) {
        address t0 = IUniswapV3Pool(pool).token0();
        address t1 = IUniswapV3Pool(pool).token1();
        if (t0 == address(weth) || t1 == address(weth)) return address(weth);
        if (t0 == address(usdg) || t1 == address(usdg)) return address(usdg);
        revert("Unsupported pair");
    }

    /// @dev The pool's non-quote side.
    function _otherToken(address pool, address quote) internal view returns (address) {
        address t0 = IUniswapV3Pool(pool).token0();
        return t0 == quote ? IUniswapV3Pool(pool).token1() : t0;
    }

    /// @dev Executes a V2 swap. There is no callback: the pair is paid by
    /// transferring the input token to it before `swap` is called, and it
    /// sends the output straight to `recipient`. The formula bakes in V2's
    /// own 0.3% pool fee, separate from the protocol fee already deducted by
    /// the caller.
    function _swapV2(address pair, address tokenIn, uint256 amountIn, address recipient)
        internal
        returns (uint256 amountOut)
    {
        bool zeroForOne = IUniswapV2Pair(pair).token0() == tokenIn;
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pair).getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            zeroForOne ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
        require(reserveIn > 0 && reserveOut > 0, "No liquidity");

        uint256 amountInWithFee = amountIn * 997;
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
        require(amountOut > 0, "No output");

        IERC20(tokenIn).safeTransfer(pair, amountIn);
        if (zeroForOne) {
            IUniswapV2Pair(pair).swap(0, amountOut, recipient, "");
        } else {
            IUniswapV2Pair(pair).swap(amountOut, 0, recipient, "");
        }
    }

    /// @dev Executes a V4 swap through `unlock`. The pool manager calls back
    /// into `unlockCallback` before `unlock` returns, so everything the swap
    /// needs travels through the encoded data and nothing has to survive past
    /// this one call, unlike the transient storage V3's callback relies on.
    function _swapV4(PoolKey memory key, bool zeroForOne, uint256 amountIn, address recipient)
        internal
        returns (uint256 amountOut)
    {
        bytes memory result = poolManager.unlock(
            abi.encode(
                key,
                V4SwapParams({
                    zeroForOne: zeroForOne,
                    // V4 signs this the opposite way from V3: negative is
                    // exact input, positive is exact output.
                    amountSpecified: -int256(amountIn),
                    sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1
                }),
                recipient
            )
        );
        amountOut = abi.decode(result, (uint256));
    }

    /// @notice Called by the pool manager mid-`unlock`, never by anyone else.
    /// @dev A positive delta is owed to the router by the pool and is taken
    /// out to `recipient`; a negative delta is owed to the pool by the router
    /// and is paid by transferring the token in, then settling.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "Unexpected callback");
        (PoolKey memory key, V4SwapParams memory params, address recipient) =
            abi.decode(data, (PoolKey, V4SwapParams, address));

        BalanceDelta delta = poolManager.swap(key, params, "");
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();

        if (delta0 < 0) _settleV4(key.currency0, uint256(uint128(-delta0)));
        if (delta1 < 0) _settleV4(key.currency1, uint256(uint128(-delta1)));

        uint256 amountOut;
        if (delta0 > 0) {
            amountOut = uint256(uint128(delta0));
            poolManager.take(key.currency0, recipient, amountOut);
        }
        if (delta1 > 0) {
            amountOut = uint256(uint128(delta1));
            poolManager.take(key.currency1, recipient, amountOut);
        }

        return abi.encode(amountOut);
    }

    /// @dev Pays what the router owes the pool manager for one currency: sync
    /// first so `settle` can see what arrives, then transfer, then settle.
    function _settleV4(Currency currency, uint256 amount) internal {
        poolManager.sync(currency);
        IERC20(Currency.unwrap(currency)).safeTransfer(address(poolManager), amount);
        poolManager.settle();
    }

    /// @dev A hookless pool is always reachable. A hooked one runs arbitrary
    /// code on every swap through it, so it has to be reviewed and allowed
    /// first - see `setV4HookAllowed`.
    function _checkHook(IHooks hooks) internal view {
        address hook = address(hooks);
        if (hook == address(0)) return;
        require(v4HookAllowed[hook], "Hook not allowed");
    }

    /// @dev V4 carries its currencies in the key itself, so unlike `_quoteOf`
    /// this needs no external call to find them.
    function _quoteOfV4(PoolKey calldata key) internal view returns (address) {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(weth) || c1 == address(weth)) return address(weth);
        if (c0 == address(usdg) || c1 == address(usdg)) return address(usdg);
        revert("Unsupported pair");
    }

    /// @dev The pool's non-quote side.
    function _otherTokenV4(PoolKey calldata key, address quote) internal pure returns (address) {
        address c0 = Currency.unwrap(key.currency0);
        return c0 == quote ? Currency.unwrap(key.currency1) : c0;
    }

    // --- fees --------------------------------------------------------------

    function _accrue(address quote, uint256 amount) internal {
        if (amount == 0) return;

        if (quote == address(weth)) {
            pendingFees += amount;
        } else {
            pendingUsdgFees += amount;
        }

        if (staking == address(0)) return;
        if (pendingFees >= flushThreshold || pendingUsdgFees >= usdgFlushThreshold) _flush();
    }

    /// @notice Send collected fees to staking. Callable by anyone.
    function flushFees() external nonReentrant {
        require(staking != address(0), "Staking unset");
        require(pendingFees > 0 || pendingUsdgFees > 0, "Nothing pending");
        _flush();
    }

    function _flush() internal {
        // Convert first, so the vault is only ever notified of WETH. A failed
        // conversion must not strand the WETH already collected, so the two are
        // kept separate until the swap has actually returned.
        uint256 usdgAmount = pendingUsdgFees;
        if (usdgAmount > 0) {
            pendingUsdgFees = 0;
            uint256 converted = _swap(usdgWethPool, address(usdg), usdgAmount, address(this));
            pendingFees += converted;
            emit UsdgFeesConverted(usdgAmount, converted);
        }

        uint256 amount = pendingFees;
        if (amount == 0) return;
        pendingFees = 0;
        IERC20(address(weth)).forceApprove(staking, amount);
        IDivsStaking(staking).notifyFee(amount);
        emit FeesFlushed(amount);
    }

    // --- admin -------------------------------------------------------------

    function setStaking(address _staking) external onlyOwner {
        staking = _staking;
        emit StakingUpdated(_staking);
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        feeBps = _feeBps;
        emit FeeBpsUpdated(_feeBps);
    }

    function setFlushThreshold(uint256 _threshold) external onlyOwner {
        flushThreshold = _threshold;
        emit FlushThresholdUpdated(_threshold);
    }

    function setUsdgFlushThreshold(uint256 _threshold) external onlyOwner {
        usdgFlushThreshold = _threshold;
        emit UsdgFlushThresholdUpdated(_threshold);
    }

    /// @notice Allow or revoke one V4 hook. Hookless pools never need this -
    /// they are reachable from deployment.
    function setV4HookAllowed(address hook, bool allowed) external onlyOwner {
        require(hook != address(0), "Hookless is already allowed");
        v4HookAllowed[hook] = allowed;
        emit V4HookAllowedSet(hook, allowed);
    }

    /// @dev Only the WETH contract pays ETH in, when unwrapping for a seller.
    receive() external payable {
        require(msg.sender == address(weth), "Direct ETH");
    }
}
