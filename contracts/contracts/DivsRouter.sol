// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
contract DivsRouter is Ownable, ReentrancyGuard {
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
    event FeesFlushed(uint256 amount);
    event FeeBpsUpdated(uint256 feeBps);
    event StakingUpdated(address staking);
    event FlushThresholdUpdated(uint256 threshold);
    event UsdgFlushThresholdUpdated(uint256 threshold);
    event UsdgFeesConverted(uint256 usdgIn, uint256 wethOut);

    constructor(
        address _weth,
        address _usdg,
        address _usdgWethPool,
        address _staking,
        uint256 _feeBps,
        address _owner
    ) Ownable(_owner) {
        require(_weth != address(0) && _usdg != address(0), "Zero token");
        require(_usdgWethPool != address(0), "Zero pool");
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        weth = IWETH9(_weth);
        usdg = IERC20(_usdg);
        usdgWethPool = _usdgWethPool;
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

    /// @dev Only the WETH contract pays ETH in, when unwrapping for a seller.
    receive() external payable {
        require(msg.sender == address(weth), "Direct ETH");
    }
}
