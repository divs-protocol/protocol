// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {DivsVault} from "./DivsVault.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";

/// @dev Exposes the internal `_harvest(token, user)` so its payout recipient can
/// be asserted independently of `msg.sender`. Every production entry point
/// currently passes `msg.sender`, which would mask a wrong recipient.
contract DivsVaultHarness is DivsVault {
    constructor(address _feeCollector) DivsVault(_feeCollector) {}

    function harvestFor(address stockToken, address user) external {
        _harvest(stockToken, user);
    }
}

contract DivsVaultTest is Test {
    DivsVault vault;
    MockStockToken token;

    address feeCollector = makeAddr("feeCollector");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant INITIAL_MULTIPLIER = 2e18;
    uint256 constant FEE_BPS = 300;

    function setUp() public {
        token = new MockStockToken(INITIAL_MULTIPLIER);
        vault = new DivsVault(feeCollector);

        token.mint(alice, 1000e18);
        token.mint(bob, 1000e18);

        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    function _deposit(address user, uint256 amount) internal {
        vm.prank(user);
        vault.deposit(address(token), amount);
    }

    function _rawAmount(address user) internal view returns (uint256) {
        (uint256 rawAmount,) = vault.deposits(address(token), user);
        return rawAmount;
    }

    function _entryMultiplier(address user) internal view returns (uint256) {
        (, uint256 entryMultiplier) = vault.deposits(address(token), user);
        return entryMultiplier;
    }

    // --- Deposit ---

    function test_DepositRecordsPrincipalAndEntryMultiplier() public {
        _deposit(alice, 100e18);

        assertEq(_rawAmount(alice), 100e18);
        assertEq(_entryMultiplier(alice), INITIAL_MULTIPLIER);
        assertEq(token.balanceOf(address(vault)), 100e18);
    }

    function test_DepositRevertsOnZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Cannot deposit 0"));
        vault.deposit(address(token), 0);
    }

    /// @dev Fix #7: the vault credits the balance delta, not the requested amount.
    /// At a multiplier of 3e18 the share conversion floors, so 100e18 requested
    /// lands as 1 wei less. Crediting the request left the vault permanently
    /// short by that wei, amplified by every later rebase.
    function test_DepositCreditsAmountActuallyReceivedNotRequested() public {
        token.setMultiplier(3e18);

        uint256 vaultBefore = token.balanceOf(address(vault));
        _deposit(alice, 100e18);
        uint256 actuallyReceived = token.balanceOf(address(vault)) - vaultBefore;

        assertLt(actuallyReceived, 100e18, "mock should floor the share conversion");
        assertEq(_rawAmount(alice), actuallyReceived);
    }

    // --- Yield accounting (fix #1) ---

    /// @dev The core regression test. `rawAmount` is denominated at
    /// `entryMultiplier`, so growth from 2e18 to 3e18 is a 50% gain, not 100%.
    /// The old `/ 1e18` formula returned 100e18 here and overpaid by 2x.
    function test_PendingYieldScalesByEntryMultiplierNotFixed1e18() public {
        _deposit(alice, 100e18);

        token.setMultiplier(3e18);

        assertEq(vault.pendingYield(address(token), alice), 50e18);
    }

    /// @dev Solvency invariant: what the vault owes a lone depositor must equal
    /// what its own rebasing balance actually gained. This is the assertion the
    /// old formula could not satisfy for any entry multiplier other than 1e18.
    function test_PendingYieldEqualsActualVaultBalanceGrowth() public {
        _deposit(alice, 100e18);
        uint256 balanceBefore = token.balanceOf(address(vault));

        token.setMultiplier(5e18);

        uint256 actualGrowth = token.balanceOf(address(vault)) - balanceBefore;
        assertEq(vault.pendingYield(address(token), alice), actualGrowth);
    }

    function test_NoPendingYieldWhenMultiplierIsFlat() public {
        _deposit(alice, 100e18);
        assertEq(vault.pendingYield(address(token), alice), 0);
    }

    function test_NoPendingYieldWhenMultiplierFalls() public {
        _deposit(alice, 100e18);
        token.setMultiplier(1e18);
        assertEq(vault.pendingYield(address(token), alice), 0);
    }

    function test_NoPendingYieldWithoutDeposit() public {
        token.setMultiplier(4e18);
        assertEq(vault.pendingYield(address(token), alice), 0);
    }

    // --- Harvest ---

    function test_HarvestSplitsYieldBetweenUserAndFeeCollector() public {
        _deposit(alice, 100e18);
        token.setMultiplier(3e18);

        uint256 expectedYield = 50e18;
        uint256 expectedFee = (expectedYield * FEE_BPS) / 10000;
        uint256 expectedPayout = expectedYield - expectedFee;

        uint256 aliceBefore = token.balanceOf(alice);

        vm.prank(alice);
        vault.harvest(address(token));

        assertApproxEqAbs(token.balanceOf(alice) - aliceBefore, expectedPayout, 2);
        assertApproxEqAbs(token.balanceOf(feeCollector), expectedFee, 2);
        assertEq(_entryMultiplier(alice), 3e18);
        assertEq(_rawAmount(alice), 100e18);
    }

    function test_HarvestLeavesPrincipalIntactInVault() public {
        _deposit(alice, 100e18);
        token.setMultiplier(3e18);

        vm.prank(alice);
        vault.harvest(address(token));

        // Rounding on outgoing transfers floors in the vault's favour, never against it.
        assertGe(token.balanceOf(address(vault)), 100e18);
        assertApproxEqAbs(token.balanceOf(address(vault)), 100e18, 10);
    }

    function test_HarvestIsIdempotentWithinSameMultiplier() public {
        _deposit(alice, 100e18);
        token.setMultiplier(3e18);

        vm.prank(alice);
        vault.harvest(address(token));
        uint256 aliceAfterFirst = token.balanceOf(alice);

        vm.prank(alice);
        vault.harvest(address(token));

        assertEq(token.balanceOf(alice), aliceAfterFirst);
    }

    /// @dev Fix #3: `_harvest` credits the `user` argument, not `msg.sender`.
    /// Before the fix a keeper calling on someone else's behalf received their yield.
    function test_HarvestPaysDepositorNotCaller() public {
        DivsVaultHarness harness = new DivsVaultHarness(feeCollector);

        vm.prank(alice);
        token.approve(address(harness), type(uint256).max);
        vm.prank(alice);
        harness.deposit(address(token), 100e18);

        token.setMultiplier(3e18);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        // Bob is the caller; Alice is the depositor.
        vm.prank(bob);
        harness.harvestFor(address(token), alice);

        assertEq(token.balanceOf(bob), bobBefore, "caller must not receive yield");
        assertApproxEqAbs(token.balanceOf(alice) - aliceBefore, 48.5e18, 2);
    }

    // --- Second deposit ---

    function test_SecondDepositHarvestsPendingYieldFirst() public {
        _deposit(alice, 100e18);
        token.setMultiplier(3e18);

        uint256 aliceBefore = token.balanceOf(alice);
        _deposit(alice, 60e18);

        // Received the 48.5e18 payout, then paid in 60e18.
        assertApproxEqAbs(aliceBefore - token.balanceOf(alice), 11.5e18, 2);
        assertEq(_rawAmount(alice), 160e18);
        assertEq(_entryMultiplier(alice), 3e18);
    }

    // --- Withdraw ---

    function test_WithdrawReturnsPrincipalAndPendingYield() public {
        _deposit(alice, 100e18);
        token.setMultiplier(3e18);

        uint256 aliceBefore = token.balanceOf(alice);

        vm.prank(alice);
        vault.withdraw(address(token));

        // 48.5e18 net yield + 100e18 principal.
        assertApproxEqAbs(token.balanceOf(alice) - aliceBefore, 148.5e18, 4);
        assertEq(_rawAmount(alice), 0);
        assertEq(_entryMultiplier(alice), 0);
    }

    function test_WithdrawRevertsWithoutDeposit() public {
        vm.prank(alice);
        vm.expectRevert(bytes("No active deposit"));
        vault.withdraw(address(token));
    }

    // --- Multi-user solvency ---

    /// @dev The scenario the old formula broke: Bob enters at a higher multiplier
    /// than Alice. Previously both were credited yield computed against a fixed
    /// 1e18, claiming 670e18 against a 480e18 balance, so Bob's exit would have
    /// eaten Alice's principal.
    function test_TwoUsersEnteringAtDifferentMultipliersBothExitWhole() public {
        _deposit(alice, 100e18);

        token.setMultiplier(3e18);
        _deposit(bob, 90e18);

        token.setMultiplier(6e18);

        // Claims must be fully covered by the vault's actual balance.
        uint256 aliceClaim = _rawAmount(alice) + vault.pendingYield(address(token), alice);
        uint256 bobClaim = _rawAmount(bob) + vault.pendingYield(address(token), bob);
        assertEq(aliceClaim, 300e18);
        assertEq(bobClaim, 180e18);
        assertGe(token.balanceOf(address(vault)), aliceClaim + bobClaim);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        vm.prank(alice);
        vault.withdraw(address(token));
        vm.prank(bob);
        vault.withdraw(address(token));

        // Alice: 100 principal + 200 yield - 3% fee. Bob: 90 + 90 - 3%.
        assertApproxEqAbs(token.balanceOf(alice) - aliceBefore, 294e18, 10);
        assertApproxEqAbs(token.balanceOf(bob) - bobBefore, 177.3e18, 10);
        assertApproxEqAbs(token.balanceOf(feeCollector), 8.7e18, 10);

        // Vault fully drained apart from rounding dust.
        assertApproxEqAbs(token.balanceOf(address(vault)), 0, 10);
    }

    function test_LastWithdrawerIsNeverStarvedByEarlierHarvests() public {
        _deposit(alice, 100e18);
        token.setMultiplier(3e18);
        _deposit(bob, 90e18);
        token.setMultiplier(6e18);

        // Alice harvests repeatedly before Bob exits.
        vm.prank(alice);
        vault.harvest(address(token));
        token.setMultiplier(9e18);
        vm.prank(alice);
        vault.harvest(address(token));

        uint256 bobClaim = _rawAmount(bob) + vault.pendingYield(address(token), bob);
        assertGe(token.balanceOf(address(vault)), bobClaim);

        vm.prank(bob);
        vault.withdraw(address(token));
    }

    // --- Fee collector admin (fix #5) ---

    function test_ConstructorRejectsZeroFeeCollector() public {
        vm.expectRevert(bytes("Fee collector is zero address"));
        new DivsVault(address(0));
    }

    function test_OwnerCanUpdateFeeCollector() public {
        address newCollector = makeAddr("newCollector");

        vault.setFeeCollector(newCollector);
        assertEq(vault.feeCollector(), newCollector);

        _deposit(alice, 100e18);
        token.setMultiplier(3e18);
        vm.prank(alice);
        vault.harvest(address(token));

        assertApproxEqAbs(token.balanceOf(newCollector), 1.5e18, 2);
        assertEq(token.balanceOf(feeCollector), 0);
    }

    function test_SetFeeCollectorRejectsZeroAddress() public {
        vm.expectRevert(bytes("Fee collector is zero address"));
        vault.setFeeCollector(address(0));
    }

    function test_SetFeeCollectorIsOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        vault.setFeeCollector(alice);
    }

    // --- Fuzz ---

    /// @dev Whatever the entry point and growth, a lone depositor can never be
    /// owed more than the vault actually holds.
    function testFuzz_ClaimNeverExceedsVaultBalance(
        uint256 entryMultiplier,
        uint256 growthMultiplier,
        uint256 amount
    ) public {
        entryMultiplier = bound(entryMultiplier, 1e15, 1e21);
        growthMultiplier = bound(growthMultiplier, entryMultiplier, 1e24);
        amount = bound(amount, 1e12, 500e18);

        token.setMultiplier(entryMultiplier);
        // Mint at the fuzzed multiplier: the balance seeded in setUp rebases with
        // it and may no longer cover `amount` in display units.
        token.mint(alice, amount);
        _deposit(alice, amount);

        token.setMultiplier(growthMultiplier);

        uint256 claim = _rawAmount(alice) + vault.pendingYield(address(token), alice);
        assertGe(token.balanceOf(address(vault)), claim);
    }

    // --- Downward rebase (fix #6) ---

    /// @dev A falling multiplier is a loss on the underlying stock, and it lands
    /// on the depositor who holds it. Previously `withdraw` paid out the full
    /// nominal principal: with one depositor that reverted, with others present
    /// it would have been funded out of their balances.
    function test_WithdrawAfterDownRebaseReturnsProportionalShare() public {
        _deposit(alice, 100e18);

        token.setMultiplier(1e18);

        // Halving the multiplier halves what the vault holds, and the claim with it.
        assertEq(token.balanceOf(address(vault)), 50e18);
        assertEq(vault.positionValue(address(token), alice), 50e18);

        uint256 aliceBefore = token.balanceOf(alice);

        vm.prank(alice);
        vault.withdraw(address(token));

        assertEq(token.balanceOf(alice) - aliceBefore, 50e18);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    /// @dev The loss must not be socialised: Bob's claim is untouched by the fact
    /// that Alice exits into a down-rebased vault.
    function test_DownRebaseLossIsNotSocialisedOntoOtherDepositors() public {
        _deposit(alice, 100e18);
        _deposit(bob, 100e18);

        token.setMultiplier(1e18);

        vm.prank(alice);
        vault.withdraw(address(token));

        assertEq(vault.positionValue(address(token), bob), 50e18);
        assertGe(token.balanceOf(address(vault)), 50e18);

        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw(address(token));
        assertEq(token.balanceOf(bob) - bobBefore, 50e18);
    }

    /// @dev Depositing while down-rebased must convert into entry-denominated
    /// units, or `rawAmount` silently mixes two different scales.
    function test_DepositWhileDownRebasedIsNormalisedToEntryUnits() public {
        _deposit(alice, 100e18);
        token.setMultiplier(1e18);

        // Position is worth 50e18; adding 50e18 should make it worth 100e18.
        _deposit(alice, 50e18);

        assertEq(_entryMultiplier(alice), 2e18);
        assertEq(_rawAmount(alice), 200e18);
        assertEq(vault.positionValue(address(token), alice), 100e18);
    }

    /// @dev A dip that recovers costs the depositor nothing.
    function test_DownRebaseFollowedByRecoveryRestoresFullClaim() public {
        _deposit(alice, 100e18);

        token.setMultiplier(1e18);
        assertEq(vault.positionValue(address(token), alice), 50e18);

        token.setMultiplier(2e18);
        assertEq(vault.positionValue(address(token), alice), 100e18);
        assertEq(vault.pendingYield(address(token), alice), 0);
    }

    // --- Fuzz: downward moves ---

    /// @dev The claim tracks the vault's actual holdings in both directions.
    function testFuzz_ClaimNeverExceedsVaultBalanceInEitherDirection(
        uint256 entryMultiplier,
        uint256 nextMultiplier,
        uint256 amount
    ) public {
        entryMultiplier = bound(entryMultiplier, 1e15, 1e21);
        nextMultiplier = bound(nextMultiplier, 1e15, 1e24);
        amount = bound(amount, 1e12, 500e18);

        token.setMultiplier(entryMultiplier);
        token.mint(alice, amount);
        _deposit(alice, amount);

        token.setMultiplier(nextMultiplier);

        uint256 claim = vault.positionValue(address(token), alice);
        assertGe(token.balanceOf(address(vault)), claim);

        // And that claim is actually payable.
        vm.prank(alice);
        vault.withdraw(address(token));
    }
}
