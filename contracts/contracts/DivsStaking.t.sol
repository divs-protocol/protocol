// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DivsStaking} from "./DivsStaking.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev The properties that matter here are solvency ones: the contract must never
/// pay out more WETH than was notified, and must never pay DIVS emissions out of
/// staked principal. Both are asserted directly and under fuzzing.
contract DivsStakingTest is Test {
    DivsStaking staking;
    MockERC20 divs;
    MockERC20 weth;
    MockERC20 lp;

    address owner = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0B);
    address feeSource = address(0xFEE);
    address multisig = address(0x5AFE);

    uint256 constant DIVS_POOL = 0;
    uint256 constant LP_POOL = 1;
    uint256 constant WEEK = 7 days;

    function setUp() public {
        divs = new MockERC20("Divs", "DIVS");
        weth = new MockERC20("Wrapped Ether", "WETH");
        lp = new MockERC20("DIVS/WETH LP", "DIVS-LP");

        staking = new DivsStaking(address(divs), address(weth), owner);

        vm.startPrank(owner);
        staking.addPool(address(divs), 10_000); // 1x
        staking.addPool(address(lp), 20_000); // 2x for liquidity providers
        vm.stopPrank();

        _fund(alice);
        _fund(bob);

        weth.mint(feeSource, 1_000_000e18);
        vm.prank(feeSource);
        weth.approve(address(staking), type(uint256).max);
    }

    function _fund(address user) internal {
        divs.mint(user, 1_000_000e18);
        lp.mint(user, 1_000_000e18);
        vm.startPrank(user);
        divs.approve(address(staking), type(uint256).max);
        lp.approve(address(staking), type(uint256).max);
        vm.stopPrank();
    }

    function _stake(address user, uint256 poolId, uint256 amount, uint256 lockWeeks) internal {
        vm.prank(user);
        staking.stake(poolId, amount, lockWeeks);
    }

    function _notifyFee(uint256 amount) internal {
        vm.prank(feeSource);
        staking.notifyFee(amount);
    }

    // --- fee distribution --------------------------------------------------

    function test_SingleStakerReceivesAllFees() public {
        _stake(alice, DIVS_POOL, 100e18, 0);
        _notifyFee(10e18);

        (uint256 pendingWeth,) = staking.pendingRewards(alice);
        assertEq(pendingWeth, 10e18, "sole staker should receive every fee");
    }

    function test_FeesSplitProportionallyToStake() public {
        _stake(alice, DIVS_POOL, 300e18, 0);
        _stake(bob, DIVS_POOL, 100e18, 0);
        _notifyFee(8e18);

        (uint256 aliceWeth,) = staking.pendingRewards(alice);
        (uint256 bobWeth,) = staking.pendingRewards(bob);
        assertEq(aliceWeth, 6e18, "3:1 stake should take 3/4 of fees");
        assertEq(bobWeth, 2e18, "3:1 stake should leave 1/4 of fees");
    }

    function test_LockBoostIncreasesFeeShare() public {
        // Equal principal, but Alice locks for the full year at 4x.
        _stake(alice, DIVS_POOL, 100e18, 52);
        _stake(bob, DIVS_POOL, 100e18, 0);
        _notifyFee(10e18);

        (uint256 aliceWeth,) = staking.pendingRewards(alice);
        (uint256 bobWeth,) = staking.pendingRewards(bob);
        assertEq(aliceWeth, 8e18, "4x weight against 1x should take 4/5");
        assertEq(bobWeth, 2e18, "1x weight against 4x should take 1/5");
    }

    function test_LpPoolCarriesItsMultiplier() public {
        _stake(alice, LP_POOL, 100e18, 0); // 2x
        _stake(bob, DIVS_POOL, 100e18, 0); // 1x
        _notifyFee(9e18);

        (uint256 aliceWeth,) = staking.pendingRewards(alice);
        (uint256 bobWeth,) = staking.pendingRewards(bob);
        assertEq(aliceWeth, 6e18, "LP at 2x should take 2/3");
        assertEq(bobWeth, 3e18, "single-sided at 1x should take 1/3");
    }

    function test_FeesArrivingBeforeAnyStakeAreHeldNotLost() public {
        _notifyFee(5e18);
        assertEq(staking.unallocatedFees(), 5e18, "fees with no stakers should be held");

        _stake(alice, DIVS_POOL, 100e18, 0);
        _notifyFee(5e18);

        (uint256 pendingWeth,) = staking.pendingRewards(alice);
        assertEq(pendingWeth, 10e18, "held fees should fold into the next distribution");
    }

    function test_StakerJoiningLaterDoesNotShareEarlierFees() public {
        _stake(alice, DIVS_POOL, 100e18, 0);
        _notifyFee(10e18);
        _stake(bob, DIVS_POOL, 100e18, 0);

        (uint256 aliceWeth,) = staking.pendingRewards(alice);
        (uint256 bobWeth,) = staking.pendingRewards(bob);
        assertEq(aliceWeth, 10e18, "earlier staker keeps fees accrued before the join");
        assertEq(bobWeth, 0, "late staker must not retroactively claim fees");
    }

    function test_ClaimTransfersAndZeroesPending() public {
        _stake(alice, DIVS_POOL, 100e18, 0);
        _notifyFee(10e18);

        vm.prank(alice);
        staking.claim();

        assertEq(weth.balanceOf(alice), 10e18, "claim should transfer the WETH");
        (uint256 pendingWeth,) = staking.pendingRewards(alice);
        assertEq(pendingWeth, 0, "claim should zero the pending balance");
    }

    // --- emissions ---------------------------------------------------------

    /// @dev Helper: fund a period as the owner.
    function _notifyEmission(uint256 amount, uint256 duration) internal {
        divs.mint(owner, amount);
        vm.startPrank(owner);
        divs.approve(address(staking), amount);
        staking.notifyEmission(amount, duration);
        vm.stopPrank();
    }

    function test_NotifyEmissionDerivesRateFromAmountFunded() public {
        _notifyEmission(1000e18, 1000);
        assertEq(staking.emissionRate(), 1e18, "rate is funding divided by duration");
        assertEq(staking.periodFinish(), block.timestamp + 1000, "period ends after the duration");
    }

    function test_EmissionsAccrueOverTime() public {
        _notifyEmission(1000e18, 1000); // 1 DIVS/sec
        _stake(alice, DIVS_POOL, 100e18, 0);
        vm.warp(block.timestamp + 100);

        (, uint256 pendingDivs) = staking.pendingRewards(alice);
        assertEq(pendingDivs, 100e18, "sole staker accrues the whole rate");
    }

    /// @dev The point of epoch funding: entitlement stops growing when the funded
    /// period ends, instead of building claims nothing backs.
    function test_EmissionsHaltAtPeriodFinish() public {
        _notifyEmission(100e18, 100); // 1 DIVS/sec for 100s
        _stake(alice, DIVS_POOL, 100e18, 0);

        vm.warp(block.timestamp + 500); // five times the period

        (, uint256 pendingDivs) = staking.pendingRewards(alice);
        assertEq(pendingDivs, 100e18, "accrual must stop at periodFinish, not run on");

        vm.prank(alice);
        (, uint256 divsOut) = staking.claim();
        assertEq(divsOut, 100e18, "the full funded amount is payable");
        assertEq(staking.emissionReserve(), 0, "reserve is exactly drained, no IOU left");
    }

    function test_EmissionsCannotBeScheduledWithoutFunding() public {
        _stake(alice, DIVS_POOL, 100e18, 0);
        vm.warp(block.timestamp + 365 days);

        assertEq(staking.emissionRate(), 0, "no rate exists until a period is funded");
        (, uint256 pendingDivs) = staking.pendingRewards(alice);
        assertEq(pendingDivs, 0, "nothing accrues without funding");
    }

    /// @dev DIVS is both staked and emitted. Staked principal must never be
    /// treated as emission budget, or one staker is paid out of another.
    function test_StakedPrincipalIsNeverEmitted() public {
        _stake(alice, DIVS_POOL, 500_000e18, 0);
        _stake(bob, DIVS_POOL, 500_000e18, 0);
        // The contract now holds 1M DIVS, every unit of it someone else's principal.
        assertEq(divs.balanceOf(address(staking)), 1_000_000e18, "contract holds only principal");
        assertEq(staking.emissionsFunded(), 0, "none of it counts as emission budget");

        vm.warp(block.timestamp + 365 days);
        vm.prank(alice);
        (, uint256 divsOut) = staking.claim();
        assertEq(divsOut, 0, "principal must not be emitted");

        vm.prank(bob);
        staking.unstake(DIVS_POOL, 500_000e18);
        assertEq(divs.balanceOf(bob), 1_000_000e18, "the other staker exits whole");
    }

    function test_MidPeriodNotifyRollsRemainderIntoNewRate() public {
        _stake(alice, DIVS_POOL, 100e18, 0);
        _notifyEmission(100e18, 100); // 1/sec
        vm.warp(block.timestamp + 50); // 50 accrued, 50 remaining

        _notifyEmission(50e18, 100); // 50 new + 50 rolled over, over 100s
        assertEq(staking.emissionRate(), 1e18, "remainder rolls into the new rate");
    }

    /// @dev Time passing with nothing staked emits nothing, so that budget stays
    /// available rather than being burned to an empty pool.
    function test_BudgetIsNotBurnedWhileNothingIsStaked() public {
        _notifyEmission(100e18, 100);
        vm.warp(block.timestamp + 200); // whole period elapses with no stakers

        assertEq(staking.emissionsAccrued(), 0, "nothing accrues to an empty pool");

        _stake(alice, DIVS_POOL, 100e18, 0);
        _notifyEmission(100e18, 100); // the untouched budget is still fundable
        vm.warp(block.timestamp + 100);

        (, uint256 pendingDivs) = staking.pendingRewards(alice);
        assertEq(pendingDivs, 100e18, "the later period pays out in full");
    }

    function test_NotifyEmissionRejectsZeroDuration() public {
        divs.mint(owner, 100e18);
        vm.startPrank(owner);
        divs.approve(address(staking), 100e18);
        vm.expectRevert("Zero duration");
        staking.notifyEmission(100e18, 0);
        vm.stopPrank();
    }

    // --- locks -------------------------------------------------------------

    function test_CannotUnstakeWhileLocked() public {
        _stake(alice, DIVS_POOL, 100e18, 4);
        vm.prank(alice);
        vm.expectRevert("Still locked");
        staking.unstake(DIVS_POOL, 100e18);
    }

    function test_CanUnstakeAfterLockExpires() public {
        _stake(alice, DIVS_POOL, 100e18, 4);
        vm.warp(block.timestamp + 4 * WEEK);
        vm.prank(alice);
        staking.unstake(DIVS_POOL, 100e18);
        assertEq(divs.balanceOf(alice), 1_000_000e18, "full principal returns after the lock");
    }

    function test_CannotShortenAnExistingLock() public {
        _stake(alice, DIVS_POOL, 100e18, 52);
        vm.prank(alice);
        vm.expectRevert("Cannot shorten lock");
        staking.stake(DIVS_POOL, 1e18, 0);
    }

    function test_ExtendLockRaisesWeight() public {
        _stake(alice, DIVS_POOL, 100e18, 0);
        uint256 flexibleWeight = staking.totalWeight();

        vm.prank(alice);
        staking.extendLock(DIVS_POOL, 52);

        assertEq(staking.totalWeight(), flexibleWeight * 4, "52-week lock is 4x flexible");
    }

    /// @dev Without `poke`, an expired lock would keep earning its boost, diluting
    /// everyone who is still actually locked.
    function test_PokeDemotesExpiredLock() public {
        _stake(alice, DIVS_POOL, 100e18, 52);
        _stake(bob, DIVS_POOL, 100e18, 0);

        vm.warp(block.timestamp + 52 * WEEK + 1);
        staking.poke(DIVS_POOL, alice);

        _notifyFee(10e18);
        (uint256 aliceWeth,) = staking.pendingRewards(alice);
        (uint256 bobWeth,) = staking.pendingRewards(bob);
        assertEq(aliceWeth, 5e18, "expired boost should fall back to 1x");
        assertEq(bobWeth, 5e18, "the other staker should no longer be diluted");
    }

    function test_LockMultiplierBoundaries() public view {
        assertEq(staking.lockMultiplierBps(0), 10_000, "flexible is 1x");
        assertEq(staking.lockMultiplierBps(26), 25_000, "half a year is 2.5x");
        assertEq(staking.lockMultiplierBps(52), 40_000, "a full year is 4x");
    }

    // --- tiers -------------------------------------------------------------

    function test_TierMultiplierAppliesToLargePositions() public {
        uint256[] memory thresholds = new uint256[](1);
        uint256[] memory mults = new uint256[](1);
        thresholds[0] = 1000e18;
        mults[0] = 15_000; // 1.5x

        vm.prank(owner);
        staking.setTiers(thresholds, mults);

        _stake(alice, DIVS_POOL, 1000e18, 0); // qualifies
        _stake(bob, DIVS_POOL, 1000e18, 0); // qualifies too

        assertEq(staking.totalWeight(), 3000e18, "both positions carry the 1.5x tier");
    }

    function test_SetTiersRejectsUnsortedThresholds() public {
        uint256[] memory thresholds = new uint256[](2);
        uint256[] memory mults = new uint256[](2);
        thresholds[0] = 100e18;
        thresholds[1] = 50e18;
        mults[0] = 11_000;
        mults[1] = 12_000;

        vm.prank(owner);
        vm.expectRevert("Thresholds not ascending");
        staking.setTiers(thresholds, mults);
    }

    // --- access control ----------------------------------------------------

    function test_OnlyOwnerCanConfigure() public {
        vm.prank(alice);
        vm.expectRevert();
        staking.notifyEmission(1e18, 100);

        vm.prank(alice);
        vm.expectRevert();
        staking.addPool(address(lp), 10_000);
    }

    /// @dev The owner is meant to become a multisig, and a one-step transfer to an
    /// address that cannot transact would lose configuration control for good.
    /// Nominating changes nothing until the nominee proves it can act.
    function test_OwnershipTransferNeedsAcceptance() public {
        vm.prank(owner);
        staking.transferOwnership(multisig);

        assertEq(staking.owner(), owner, "nominating does not hand over");
        assertEq(staking.pendingOwner(), multisig, "the nominee is recorded");

        vm.prank(multisig);
        vm.expectRevert();
        staking.addPool(address(lp), 10_000);

        // The deployer still holds it, so a wrong nominee is still recoverable.
        vm.prank(owner);
        staking.addPool(address(lp), 10_000);
    }

    function test_NominatedOwnerTakesControlOnAcceptance() public {
        vm.prank(owner);
        staking.transferOwnership(multisig);
        vm.prank(multisig);
        staking.acceptOwnership();

        assertEq(staking.owner(), multisig, "the nominee now owns it");
        assertEq(staking.pendingOwner(), address(0), "and the nomination is cleared");

        vm.prank(multisig);
        staking.addPool(address(lp), 10_000);

        vm.prank(owner);
        vm.expectRevert();
        staking.addPool(address(lp), 10_000);
    }

    function test_OnlyTheNomineeCanAccept() public {
        vm.prank(owner);
        staking.transferOwnership(multisig);

        vm.prank(alice);
        vm.expectRevert();
        staking.acceptOwnership();

        assertEq(staking.owner(), owner, "an outsider cannot take it");
    }

    // --- solvency invariants ----------------------------------------------

    /// @dev The core property: however stake sizes, locks and fees fall out, the
    /// contract can never owe more WETH than was actually notified to it.
    function testFuzz_WethPaidNeverExceedsWethNotified(
        uint96 aliceStake,
        uint96 bobStake,
        uint96 feeAmount,
        uint8 aliceLock,
        uint8 bobLock
    ) public {
        aliceStake = uint96(bound(aliceStake, 1e12, 100_000e18));
        bobStake = uint96(bound(bobStake, 1e12, 100_000e18));
        feeAmount = uint96(bound(feeAmount, 1e12, 100_000e18));
        aliceLock = uint8(bound(aliceLock, 0, 52));
        bobLock = uint8(bound(bobLock, 0, 52));

        _stake(alice, DIVS_POOL, aliceStake, aliceLock);
        _stake(bob, LP_POOL, bobStake, bobLock);
        _notifyFee(feeAmount);

        vm.prank(alice);
        (uint256 aliceOut,) = staking.claim();
        vm.prank(bob);
        (uint256 bobOut,) = staking.claim();

        assertLe(aliceOut + bobOut, feeAmount, "payouts must never exceed fees received");
        assertGe(
            weth.balanceOf(address(staking)) + aliceOut + bobOut,
            feeAmount,
            "no WETH may go missing"
        );
    }

    /// @dev Principal must survive any sequence of fee and emission activity.
    function testFuzz_PrincipalAlwaysRecoverable(
        uint96 aliceStake,
        uint96 bobStake,
        uint96 feeAmount,
        uint32 elapsed
    ) public {
        aliceStake = uint96(bound(aliceStake, 1e12, 100_000e18));
        bobStake = uint96(bound(bobStake, 1e12, 100_000e18));
        feeAmount = uint96(bound(feeAmount, 1e12, 100_000e18));

        _notifyEmission(1000e18, 1000);

        _stake(alice, DIVS_POOL, aliceStake, 0);
        _stake(bob, DIVS_POOL, bobStake, 0);
        _notifyFee(feeAmount);

        vm.warp(block.timestamp + bound(elapsed, 1, 365 days));

        vm.prank(alice);
        staking.claim();
        vm.prank(alice);
        staking.unstake(DIVS_POOL, aliceStake);
        vm.prank(bob);
        staking.unstake(DIVS_POOL, bobStake);

        assertGe(divs.balanceOf(alice), 1_000_000e18, "alice recovers at least her principal");
        assertGe(divs.balanceOf(bob), 1_000_000e18, "bob recovers at least his principal");
        assertEq(staking.totalStakedDivs(), 0, "staked accounting returns to zero");
    }
}
