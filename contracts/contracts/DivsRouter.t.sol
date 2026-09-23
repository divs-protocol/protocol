// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DivsRouter} from "./DivsRouter.sol";
import {DivsStaking} from "./DivsStaking.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockV3Pool} from "./mocks/MockV3Pool.sol";
import {MockV2Pair} from "./mocks/MockV2Pair.sol";
import {MockPoolManager} from "./mocks/MockPoolManager.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// @dev The properties that matter here are conservation ones: a trade must
/// never hand the trader more than the pool paid out, the fee must be exactly
/// the advertised rate, and every wei taken as a fee must end up at staking
/// rather than stranded in the router. All three are asserted directly and the
/// fee arithmetic is fuzzed.
contract DivsRouterTest is Test {
    DivsRouter router;
    DivsStaking staking;
    MockWETH weth;
    MockERC20 usdg;
    MockERC20 divs;
    MockERC20 aapl;
    MockERC20 amzn;
    MockV3Pool pool;
    MockV3Pool usdgPool;
    MockV3Pool usdgWethPool;

    MockV2Pair v2Pair;

    MockPoolManager poolManager;
    PoolKey v4Key;
    PoolKey v4HookedKey;
    /// @dev A stand-in hook address. The mock pool manager never calls a
    /// hook, so this only needs to be a distinct, nonzero address for the
    /// router's own allowlist to key off - proving `_checkHook` gates
    /// correctly is this suite's job, not re-proving V4's own hook dispatch.
    address constant HOOK_ADDR = address(0xBEEF);

    address owner = address(0xA11CE);
    address alice = address(0xA1);
    address multisig = address(0x5AFE);

    uint256 constant FEE_BPS = 10; // 0.10%
    /// @dev 1 AAPL = 0.1 WETH, so 1 WETH buys 10 AAPL.
    uint256 constant RATE = 10e18;
    /// @dev 1 AMZN = 250 USDG. USDG carries six decimals, not eighteen.
    uint256 constant USDG_RATE = 250e6;
    /// @dev 1 WETH = 2500 USDG, the reference used to convert fees.
    uint256 constant ETH_USDG = 2500e6;

    function setUp() public {
        weth = new MockWETH();
        usdg = new MockERC20("Global Dollar", "USDG");
        usdg.setDecimals(6);
        divs = new MockERC20("DIVS", "DIVS");
        aapl = new MockERC20("Apple", "AAPL");
        amzn = new MockERC20("Amazon", "AMZN");

        staking = new DivsStaking(address(divs), address(weth), owner);
        vm.prank(owner);
        staking.addPool(address(divs), 10_000);

        // A pool priced so that WETH in gives RATE-scaled AAPL out.
        pool = address(weth) < address(aapl)
            ? new MockV3Pool(address(weth), address(aapl), RATE)
            : new MockV3Pool(address(aapl), address(weth), 1e36 / RATE);

        aapl.mint(address(pool), 1_000_000 ether);
        weth.mint(address(pool), 1_000_000 ether);
        // Real WETH is fully backed; the mock has to be too, or a withdrawal
        // by a seller unwrapping to ETH has nothing to pay out.
        vm.deal(address(weth), 1_000_000 ether);

        // A USDG-quoted market, and the reference pool that converts its fees.
        usdgPool = address(usdg) < address(amzn)
            ? new MockV3Pool(address(usdg), address(amzn), (10 ** 36) / USDG_RATE)
            : new MockV3Pool(address(amzn), address(usdg), USDG_RATE);
        usdgWethPool = address(usdg) < address(weth)
            ? new MockV3Pool(address(usdg), address(weth), (10 ** 36) / ETH_USDG)
            : new MockV3Pool(address(weth), address(usdg), ETH_USDG);

        amzn.mint(address(usdgPool), 1_000_000 ether);
        usdg.mint(address(usdgPool), 1_000_000_000e6);
        usdg.mint(address(usdgWethPool), 1_000_000_000e6);
        weth.mint(address(usdgWethPool), 1_000_000 ether);

        // A V2 pair, same AAPL/WETH assets as the V3 pool above so both
        // venues can be exercised against tokens the fuzz tests already know.
        v2Pair = new MockV2Pair(address(aapl), address(weth));
        aapl.mint(address(v2Pair), 1_000_000 ether);
        weth.mint(address(v2Pair), 100_000 ether);

        // Same rate as the V3 pool above, so a test can assert the identical
        // exact amount through either venue.
        poolManager = new MockPoolManager();
        bool wethFirst = address(weth) < address(aapl);
        v4Key = PoolKey({
            currency0: Currency.wrap(wethFirst ? address(weth) : address(aapl)),
            currency1: Currency.wrap(wethFirst ? address(aapl) : address(weth)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        poolManager.setRate(v4Key, wethFirst ? RATE : 1e36 / RATE);

        // A second pool, identical but for its hook, to prove the allowlist
        // actually gates trading rather than merely decorating it. The mock
        // manager never calls a hook, so this can be any nonzero address.
        v4HookedKey = PoolKey({
            currency0: v4Key.currency0,
            currency1: v4Key.currency1,
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(HOOK_ADDR)
        });
        poolManager.setRate(v4HookedKey, wethFirst ? RATE : 1e36 / RATE);

        aapl.mint(address(poolManager), 1_000_000 ether);
        weth.mint(address(poolManager), 1_000_000 ether);

        router = new DivsRouter(
            address(weth),
            address(usdg),
            address(usdgWethPool),
            address(staking),
            FEE_BPS,
            owner,
            address(poolManager)
        );

        // Someone has to be staked or notifyFee parks the fee in unallocatedFees.
        divs.mint(alice, 1_000 ether);
        vm.startPrank(alice);
        divs.approve(address(staking), type(uint256).max);
        staking.stake(0, 1_000 ether, 0);
        vm.stopPrank();
    }

    function _fundAlice(uint256 amount) internal {
        weth.mint(alice, amount);
        vm.prank(alice);
        weth.approve(address(router), type(uint256).max);
    }

    // --- buying ------------------------------------------------------------

    function test_BuyChargesFeeOnTheWethSide() public {
        uint256 spend = 10 ether;
        _fundAlice(spend);

        vm.prank(alice);
        uint256 out = router.buy(address(pool), spend, 0, alice);

        uint256 fee = (spend * FEE_BPS) / 10_000;
        // Only the post-fee amount reaches the pool.
        assertEq(out, ((spend - fee) * RATE) / 1e18, "output priced on the net amount");
        assertEq(aapl.balanceOf(alice), out, "tokens delivered to the trader");
        assertEq(router.pendingFees() + weth.balanceOf(address(staking)), fee, "fee retained in full");
    }

    function test_BuyRevertsBelowMinimumOut() public {
        _fundAlice(1 ether);
        vm.prank(alice);
        vm.expectRevert("Too little received");
        router.buy(address(pool), 1 ether, 100 ether, alice);
    }

    function test_BuyWithEthWrapsAndCharges() public {
        vm.deal(alice, 5 ether);

        vm.prank(alice);
        uint256 out = router.buyWithETH{value: 5 ether}(address(pool), 0, alice);

        uint256 fee = (5 ether * FEE_BPS) / 10_000;
        assertEq(out, ((5 ether - fee) * RATE) / 1e18, "same pricing as the WETH path");
        assertEq(alice.balance, 0, "ETH spent");
    }

    // --- selling -----------------------------------------------------------

    function test_SellChargesFeeOnProceeds() public {
        uint256 size = 100 ether; // 100 AAPL
        aapl.mint(alice, size);
        vm.startPrank(alice);
        aapl.approve(address(router), type(uint256).max);
        uint256 out = router.sell(address(pool), size, 0, alice, false);
        vm.stopPrank();

        uint256 gross = (size * 1e18) / RATE;
        uint256 fee = (gross * FEE_BPS) / 10_000;
        assertEq(out, gross - fee, "trader receives proceeds net of the fee");
        assertEq(weth.balanceOf(alice), out, "WETH delivered");
    }

    function test_SellCanUnwrapToEth() public {
        uint256 size = 100 ether;
        aapl.mint(alice, size);

        vm.startPrank(alice);
        aapl.approve(address(router), type(uint256).max);
        uint256 out = router.sell(address(pool), size, 0, alice, true);
        vm.stopPrank();

        assertEq(alice.balance, out, "paid in native ETH");
        assertEq(weth.balanceOf(alice), 0, "nothing left wrapped");
    }

    // --- fee routing -------------------------------------------------------

    function test_FeesReachStakingOnceThresholdIsPassed() public {
        // Threshold is 0.05 WETH; at 10 bps that needs 50 WETH of volume.
        uint256 spend = 60 ether;
        _fundAlice(spend);

        vm.prank(alice);
        router.buy(address(pool), spend, 0, alice);

        assertEq(router.pendingFees(), 0, "flushed");
        assertEq(weth.balanceOf(address(staking)), (spend * FEE_BPS) / 10_000, "staking holds the fee");

        (uint256 pendingWeth,) = staking.pendingRewards(alice);
        assertGt(pendingWeth, 0, "the staker can claim it");
    }

    function test_SmallTradesAccrueUntilFlushed() public {
        _fundAlice(1 ether);
        vm.prank(alice);
        router.buy(address(pool), 1 ether, 0, alice);

        uint256 fee = (1 ether * FEE_BPS) / 10_000;
        assertEq(router.pendingFees(), fee, "held below the threshold");
        assertEq(weth.balanceOf(address(staking)), 0, "not yet notified");

        // Permissionless, so a pending balance is never trapped.
        vm.prank(address(0xDEAD));
        router.flushFees();
        assertEq(weth.balanceOf(address(staking)), fee, "delivered on demand");
        assertEq(router.pendingFees(), 0, "nothing left behind");
    }

    function test_FeesAccrueWhileStakingIsUnset() public {
        vm.prank(owner);
        router.setStaking(address(0));

        _fundAlice(60 ether);
        vm.prank(alice);
        router.buy(address(pool), 60 ether, 0, alice);

        assertEq(router.pendingFees(), (60 ether * FEE_BPS) / 10_000, "held, not lost");

        vm.prank(owner);
        router.setStaking(address(staking));
        router.flushFees();
        assertEq(weth.balanceOf(address(staking)), (60 ether * FEE_BPS) / 10_000, "delivered later");
    }


    /**
     * The deployment that opens trading before $DIVS exists.
     *
     * A router constructed with no staking address has to trade normally and
     * keep every fee it charges, so that the whole balance can be paid to
     * stakers once the vault is finally deployed. Nothing collected in the
     * meantime may be lost or stranded.
     */
    function test_RouterWorksWithNoStakingAddress() public {
        DivsRouter fresh = new DivsRouter(
            address(weth),
            address(usdg),
            address(usdgWethPool),
            address(0),
            FEE_BPS,
            owner,
            address(poolManager)
        );

        // Trading works with no vault in existence.
        _fundAlice(100 ether);
        vm.startPrank(alice);
        weth.approve(address(fresh), 100 ether);
        uint256 out = fresh.buy(address(pool), 100 ether, 0, alice);
        vm.stopPrank();

        assertGt(out, 0, "a trade still executes");
        assertEq(aapl.balanceOf(alice), out, "and the buyer is paid");

        uint256 expected = (100 ether * FEE_BPS) / 10_000;
        assertEq(fresh.pendingFees(), expected, "the fee is held, not lost");

        // Selling works too, and adds to the same held balance.
        vm.startPrank(alice);
        aapl.approve(address(fresh), out);
        uint256 back = fresh.sell(address(pool), out, 0, alice, false);
        vm.stopPrank();

        assertGt(back, 0, "a sale still executes");
        assertGt(fresh.pendingFees(), expected, "and its fee is held as well");
        uint256 held = fresh.pendingFees();

        // Nobody can flush while there is nowhere to flush to.
        vm.expectRevert("Staking unset");
        fresh.flushFees();

        // The vault arrives later. Everything collected in between is paid out.
        vm.prank(owner);
        fresh.setStaking(address(staking));

        uint256 before = weth.balanceOf(address(staking));
        fresh.flushFees();

        assertEq(fresh.pendingFees(), 0, "nothing left behind");
        assertEq(
            weth.balanceOf(address(staking)) - before,
            held,
            "every fee charged before the vault existed reaches it"
        );
    }

    // --- access and limits -------------------------------------------------

    /// @dev The fee rate and the staking address are the router's owner powers, so
    /// the handoff to a multisig has to be one the wrong address cannot swallow.
    function test_OwnershipTransferNeedsAcceptance() public {
        vm.prank(owner);
        router.transferOwnership(multisig);

        assertEq(router.owner(), owner, "nominating does not hand over");

        vm.prank(multisig);
        vm.expectRevert();
        router.setFeeBps(50);

        vm.prank(multisig);
        router.acceptOwnership();

        assertEq(router.owner(), multisig, "the nominee now owns it");

        vm.prank(multisig);
        router.setFeeBps(50);
        assertEq(router.feeBps(), 50, "and can configure");

        vm.prank(owner);
        vm.expectRevert();
        router.setFeeBps(10);
    }

    function test_CallbackRejectsUnexpectedCaller() public {
        vm.prank(address(0xBAD));
        vm.expectRevert("Unexpected callback");
        router.uniswapV3SwapCallback(1 ether, 0, "");
    }

    function test_FeeIsCapped() public {
        // Read the cap first: an argument is evaluated after expectRevert arms,
        // so an inline call would consume the cheatcode itself.
        uint256 overCap = router.MAX_FEE_BPS() + 1;
        vm.prank(owner);
        vm.expectRevert("Fee too high");
        router.setFeeBps(overCap);
    }

    function test_OnlyOwnerSetsFee() public {
        vm.prank(alice);
        vm.expectRevert();
        router.setFeeBps(50);
    }

    function test_ZeroFeeIsAllowed() public {
        vm.prank(owner);
        router.setFeeBps(0);

        _fundAlice(10 ether);
        vm.prank(alice);
        uint256 out = router.buy(address(pool), 10 ether, 0, alice);

        assertEq(out, (10 ether * RATE) / 1e18, "whole amount swapped");
        assertEq(router.pendingFees(), 0, "nothing charged");
    }

    function test_RejectsDirectEth() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertFalse(ok, "only the WETH contract may pay in");
    }

    // --- USDG-quoted markets -----------------------------------------------

    function test_BuyWithUsdgChargesFeeInUsdg() public {
        uint256 spend = 1_000e6; // 1,000 USDG
        usdg.mint(alice, spend);
        vm.startPrank(alice);
        usdg.approve(address(router), type(uint256).max);
        uint256 out = router.buy(address(usdgPool), spend, 0, alice);
        vm.stopPrank();

        uint256 fee = (spend * FEE_BPS) / 10_000;
        // 1 AMZN costs 250 USDG, and only the net amount reaches the pool.
        assertEq(out, ((spend - fee) * 1e18) / USDG_RATE, "priced on the net amount");
        assertEq(amzn.balanceOf(alice), out, "shares delivered");
        assertEq(router.pendingUsdgFees(), fee, "fee held in USDG, not WETH");
        assertEq(router.pendingFees(), 0, "no WETH taken from a USDG market");
    }

    function test_SellForUsdgPaysOutUsdg() public {
        uint256 size = 4 ether; // 4 AMZN
        amzn.mint(alice, size);
        vm.startPrank(alice);
        amzn.approve(address(router), type(uint256).max);
        uint256 out = router.sell(address(usdgPool), size, 0, alice, false);
        vm.stopPrank();

        uint256 gross = (size * USDG_RATE) / 1e18;
        uint256 fee = (gross * FEE_BPS) / 10_000;
        assertEq(out, gross - fee, "proceeds net of the fee");
        assertEq(usdg.balanceOf(alice), out, "paid in USDG");
    }

    function test_UsdgFeesConvertToWethBeforeReachingStaking() public {
        // The USDG threshold is 100 USDG; at 10 bps that needs 100,000 of volume.
        uint256 spend = 120_000e6;
        usdg.mint(alice, spend);
        vm.startPrank(alice);
        usdg.approve(address(router), type(uint256).max);
        router.buy(address(usdgPool), spend, 0, alice);
        vm.stopPrank();

        uint256 fee = (spend * FEE_BPS) / 10_000;
        assertEq(router.pendingUsdgFees(), 0, "converted");
        assertEq(usdg.balanceOf(address(staking)), 0, "the vault never sees USDG");

        // 2,500 USDG to the WETH, so the fee arrives as its equivalent.
        assertEq(
            weth.balanceOf(address(staking)),
            (fee * 1e18) / ETH_USDG,
            "staking holds the converted fee"
        );

        (uint256 pendingWeth,) = staking.pendingRewards(alice);
        assertGt(pendingWeth, 0, "the staker can claim it");
    }

    function test_SmallUsdgFeesWaitForTheThreshold() public {
        usdg.mint(alice, 1_000e6);
        vm.startPrank(alice);
        usdg.approve(address(router), type(uint256).max);
        router.buy(address(usdgPool), 1_000e6, 0, alice);
        vm.stopPrank();

        assertEq(router.pendingUsdgFees(), (1_000e6 * FEE_BPS) / 10_000, "held");
        assertEq(weth.balanceOf(address(staking)), 0, "not yet notified");

        // Permissionless, and it converts on the way through.
        vm.prank(address(0xDEAD));
        router.flushFees();
        assertEq(router.pendingUsdgFees(), 0, "converted on demand");
        assertGt(weth.balanceOf(address(staking)), 0, "delivered as WETH");
    }

    function test_BothQuoteAssetsFlushTogether() public {
        _fundAlice(60 ether);
        usdg.mint(alice, 1_000e6);

        vm.startPrank(alice);
        usdg.approve(address(router), type(uint256).max);
        router.buy(address(usdgPool), 1_000e6, 0, alice);
        // Crossing the WETH threshold flushes the USDG sitting alongside it.
        router.buy(address(pool), 60 ether, 0, alice);
        vm.stopPrank();

        assertEq(router.pendingFees(), 0, "WETH flushed");
        assertEq(router.pendingUsdgFees(), 0, "USDG flushed with it");

        uint256 wethFee = (60 ether * FEE_BPS) / 10_000;
        uint256 usdgFee = (1_000e6 * FEE_BPS) / 10_000;
        assertEq(
            weth.balanceOf(address(staking)),
            wethFee + (usdgFee * 1e18) / ETH_USDG,
            "both arrive as WETH"
        );
    }

    function test_EthPathRefusesAUsdgMarket() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert("Not WETH quoted");
        router.buyWithETH{value: 1 ether}(address(usdgPool), 0, alice);
    }

    function test_UnwrapRefusesAUsdgMarket() public {
        amzn.mint(alice, 1 ether);
        vm.startPrank(alice);
        amzn.approve(address(router), type(uint256).max);
        vm.expectRevert("Not WETH quoted");
        router.sell(address(usdgPool), 1 ether, 0, alice, true);
        vm.stopPrank();
    }

    function test_RejectsAPairWithNeitherQuoteAsset() public {
        MockERC20 other = new MockERC20("Other", "OTHER");
        MockV3Pool orphan = new MockV3Pool(address(aapl), address(other), 1e18);
        vm.prank(alice);
        vm.expectRevert("Unsupported pair");
        router.buy(address(orphan), 1 ether, 0, alice);
    }

    // --- V2 trading ----------------------------------------------------

    function test_BuyV2ChargesFeeOnTheWethSide() public {
        uint256 spend = 10 ether;
        _fundAlice(spend);

        vm.prank(alice);
        uint256 out = router.buyV2(address(v2Pair), spend, 0, alice);

        uint256 fee = (spend * FEE_BPS) / 10_000;
        uint256 netIn = spend - fee;
        // V2's own 0.3% pool fee applies on top of the protocol fee already
        // deducted, via the same constant-product formula a real pair uses.
        uint256 expected = (netIn * 997 * 1_000_000 ether) / (100_000 ether * 1000 + netIn * 997);
        assertEq(out, expected, "priced by the constant-product curve");
        assertEq(aapl.balanceOf(alice), out, "tokens delivered to the trader");
        assertEq(router.pendingFees() + weth.balanceOf(address(staking)), fee, "fee retained in full");
    }

    function test_BuyWithETHV2WrapsAndCharges() public {
        vm.deal(alice, 5 ether);

        vm.prank(alice);
        uint256 out = router.buyWithETHV2{value: 5 ether}(address(v2Pair), 0, alice);

        uint256 fee = (5 ether * FEE_BPS) / 10_000;
        uint256 netIn = 5 ether - fee;
        uint256 expected = (netIn * 997 * 1_000_000 ether) / (100_000 ether * 1000 + netIn * 997);
        assertEq(out, expected, "same pricing as the WETH path");
        assertEq(alice.balance, 0, "ETH spent");
    }

    function test_SellV2ChargesFeeOnProceeds() public {
        uint256 size = 100 ether; // 100 AAPL
        aapl.mint(alice, size);
        vm.startPrank(alice);
        aapl.approve(address(router), type(uint256).max);
        uint256 out = router.sellV2(address(v2Pair), size, 0, alice, false);
        vm.stopPrank();

        uint256 gross = (size * 997 * 100_000 ether) / (1_000_000 ether * 1000 + size * 997);
        uint256 fee = (gross * FEE_BPS) / 10_000;
        assertEq(out, gross - fee, "trader receives proceeds net of the fee");
        assertEq(weth.balanceOf(alice), out, "WETH delivered");
    }

    function test_SellV2CanUnwrapToEth() public {
        uint256 size = 100 ether;
        aapl.mint(alice, size);

        vm.startPrank(alice);
        aapl.approve(address(router), type(uint256).max);
        uint256 out = router.sellV2(address(v2Pair), size, 0, alice, true);
        vm.stopPrank();

        assertEq(alice.balance, out, "paid in native ETH");
        assertEq(weth.balanceOf(alice), 0, "nothing left wrapped");
    }

    // --- V4 trading ----------------------------------------------------

    /// @dev The mock pool manager is seeded with the same rate as the V3
    /// pool, so a V4 trade should be priced identically to its V3 twin.
    function test_BuyV4ChargesFeeOnTheWethSide() public {
        uint256 spend = 10 ether;
        _fundAlice(spend);

        vm.prank(alice);
        uint256 out = router.buyV4(v4Key, spend, 0, alice);

        uint256 fee = (spend * FEE_BPS) / 10_000;
        assertEq(out, ((spend - fee) * RATE) / 1e18, "output priced on the net amount");
        assertEq(aapl.balanceOf(alice), out, "tokens delivered to the trader");
        assertEq(router.pendingFees() + weth.balanceOf(address(staking)), fee, "fee retained in full");
    }

    function test_BuyWithETHV4WrapsAndCharges() public {
        vm.deal(alice, 5 ether);

        vm.prank(alice);
        uint256 out = router.buyWithETHV4{value: 5 ether}(v4Key, 0, alice);

        uint256 fee = (5 ether * FEE_BPS) / 10_000;
        assertEq(out, ((5 ether - fee) * RATE) / 1e18, "same pricing as the WETH path");
        assertEq(alice.balance, 0, "ETH spent");
    }

    function test_SellV4ChargesFeeOnProceeds() public {
        uint256 size = 100 ether; // 100 AAPL
        aapl.mint(alice, size);
        vm.startPrank(alice);
        aapl.approve(address(router), type(uint256).max);
        uint256 out = router.sellV4(v4Key, size, 0, alice, false);
        vm.stopPrank();

        uint256 gross = (size * 1e18) / RATE;
        uint256 fee = (gross * FEE_BPS) / 10_000;
        assertEq(out, gross - fee, "trader receives proceeds net of the fee");
        assertEq(weth.balanceOf(alice), out, "WETH delivered");
    }

    function test_SellV4CanUnwrapToEth() public {
        uint256 size = 100 ether;
        aapl.mint(alice, size);

        vm.startPrank(alice);
        aapl.approve(address(router), type(uint256).max);
        uint256 out = router.sellV4(v4Key, size, 0, alice, true);
        vm.stopPrank();

        assertEq(alice.balance, out, "paid in native ETH");
        assertEq(weth.balanceOf(alice), 0, "nothing left wrapped");
    }

    function test_UnlockCallbackRejectsUnexpectedCaller() public {
        vm.prank(address(0xBAD));
        vm.expectRevert("Unexpected callback");
        router.unlockCallback("");
    }

    function test_V4RevertsWhenPoolManagerUnset() public {
        DivsRouter noV4 = new DivsRouter(
            address(weth), address(usdg), address(usdgWethPool), address(staking), FEE_BPS, owner, address(0)
        );

        _fundAlice(10 ether);
        vm.startPrank(alice);
        weth.approve(address(noV4), type(uint256).max);
        vm.expectRevert("V4 unset");
        noV4.buyV4(v4Key, 10 ether, 0, alice);
        vm.stopPrank();
    }

    // --- V4 hook allowlist -----------------------------------------------

    function test_V4RejectsAnUnallowedHook() public {
        _fundAlice(10 ether);
        vm.prank(alice);
        vm.expectRevert("Hook not allowed");
        router.buyV4(v4HookedKey, 10 ether, 0, alice);
    }

    function test_V4TradesOnceItsHookIsAllowlisted() public {
        vm.prank(owner);
        router.setV4HookAllowed(HOOK_ADDR, true);

        _fundAlice(10 ether);
        vm.prank(alice);
        uint256 out = router.buyV4(v4HookedKey, 10 ether, 0, alice);

        assertGt(out, 0, "trades once the owner has reviewed and allowed the hook");
    }

    function test_OnlyOwnerAllowsAHook() public {
        vm.prank(alice);
        vm.expectRevert();
        router.setV4HookAllowed(HOOK_ADDR, true);
    }

    function test_HooklessCannotBeAddedToTheAllowlist() public {
        // There is nothing to allow or revoke - a hookless pool has been
        // reachable since deployment, and every other V4 test already
        // exercises that through `v4Key`, whose hook is address(0).
        vm.prank(owner);
        vm.expectRevert("Hookless is already allowed");
        router.setV4HookAllowed(address(0), true);
    }

    // --- cross-venue -------------------------------------------------------

    /// @dev The claim in DivsRouter's own header - that V2 and V4 reach the
    /// same fee accrual as V3 - asserted directly rather than left implicit.
    function test_AllThreeVenuesShareOneFeePot() public {
        _fundAlice(180 ether);
        vm.startPrank(alice);
        router.buy(address(pool), 60 ether, 0, alice);
        router.buyV2(address(v2Pair), 60 ether, 0, alice);
        router.buyV4(v4Key, 60 ether, 0, alice);
        vm.stopPrank();

        // The 0.05 WETH threshold is cleared by the first trade alone, so all
        // three fees land in the one flush.
        assertEq(router.pendingFees(), 0, "flushed");
        uint256 totalFee = (180 ether * FEE_BPS) / 10_000;
        assertEq(weth.balanceOf(address(staking)), totalFee, "one pot for every venue");
    }

    // --- invariants --------------------------------------------------------

    /// @dev The fee is exactly the advertised rate, and the trader is never
    /// charged twice: what leaves their wallet equals swap input plus fee.
    function testFuzz_FeeIsExactAndConserved(uint96 rawSpend, uint8 rawBps) public {
        uint256 spend = uint256(rawSpend);
        vm.assume(spend >= 1e6 && spend <= 10_000 ether);
        uint256 bps = uint256(rawBps) % (router.MAX_FEE_BPS() + 1);

        vm.prank(owner);
        router.setFeeBps(bps);

        _fundAlice(spend);
        vm.prank(alice);
        uint256 out = router.buy(address(pool), spend, 0, alice);

        uint256 fee = (spend * bps) / 10_000;
        assertEq(out, ((spend - fee) * RATE) / 1e18, "priced on the net amount");
        assertEq(weth.balanceOf(alice), 0, "the whole spend left the wallet");
        assertEq(
            router.pendingFees() + weth.balanceOf(address(staking)),
            fee,
            "every wei of fee is accounted for"
        );
        assertEq(weth.balanceOf(address(router)), router.pendingFees(), "no stray WETH");
    }
}
