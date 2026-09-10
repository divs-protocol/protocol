// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DivsStaking
/// @notice Distributes protocol trading fees (in WETH) and DIVS emissions to
/// stakers of DIVS and DIVS/WETH LP, weighted by pool, size tier and lock length.
///
/// @dev Solvency is structural rather than assumed. Two rules carry it:
///
/// 1. Fees are only ever distributed after they have actually arrived. `notifyFee`
///    pulls WETH in and only then raises the accumulator, so the contract cannot
///    promise revenue it does not hold.
/// 2. Emissions are funded before they are scheduled. `notifyEmission` pulls the
///    DIVS in and derives the rate from what arrived, so the contract can only
///    promise emissions it is holding. DIVS is both a staked and an emitted
///    asset, so `emissionsFunded` counts explicit funding only and
///    `totalStakedDivs` is never drawn on.
///
/// Reward accounting is the standard accumulator: a claim is
/// `weight * accPerWeight - debt`, so a weight change must settle outstanding
/// rewards into `pending` before it takes effect. Every mutating path routes
/// through `_settle` for that reason.
contract DivsStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant ACC_PRECISION = 1e18;
    uint256 private constant BPS = 10_000;
    uint256 public constant MAX_LOCK_WEEKS = 52;
    /// @dev 1x flexible, scaling linearly to 4x at the maximum lock.
    uint256 public constant MAX_LOCK_BPS = 40_000;
    uint256 private constant WEEK = 7 days;

    struct Pool {
        IERC20 token;
        uint256 multiplierBps;
        bool exists;
    }

    struct Position {
        uint256 amount;
        uint256 weight;
        uint64 lockEnd;
        uint32 lockWeeks;
    }

    struct Rewards {
        uint256 weight;
        uint256 wethDebt;
        uint256 divsDebt;
        uint256 pendingWeth;
        uint256 pendingDivs;
    }

    IERC20 public immutable divs;
    IERC20 public immutable weth;

    Pool[] public pools;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(address => Rewards) public rewards;

    uint256 public totalWeight;
    uint256 public totalStakedDivs;
    uint256 public emissionReserve;

    uint256 public accWethPerWeight;
    uint256 public accDivsPerWeight;
    uint256 public emissionRate;
    uint256 public lastEmissionUpdate;
    /// @notice Emissions stop accruing here unless a new period is funded.
    uint256 public periodFinish;
    /// @dev Lifetime totals. Their difference is the budget not yet promised out,
    /// which is what a new period may draw on.
    uint256 public emissionsFunded;
    uint256 public emissionsAccrued;

    /// @dev Fees that arrived while nothing was staked, folded into the next notify.
    uint256 public unallocatedFees;

    uint256[] public tierThresholds;
    uint256[] public tierMultipliersBps;

    event PoolAdded(uint256 indexed poolId, address indexed token, uint256 multiplierBps);
    event PoolMultiplierUpdated(uint256 indexed poolId, uint256 multiplierBps);
    event TiersUpdated(uint256[] thresholds, uint256[] multipliersBps);
    event Staked(address indexed user, uint256 indexed poolId, uint256 amount, uint256 lockWeeks, uint256 weight);
    event LockExtended(address indexed user, uint256 indexed poolId, uint256 lockWeeks, uint256 weight);
    event Unstaked(address indexed user, uint256 indexed poolId, uint256 amount, uint256 weight);
    event Claimed(address indexed user, uint256 wethAmount, uint256 divsAmount);
    event FeeNotified(address indexed from, uint256 amount);
    event EmissionNotified(uint256 amount, uint256 rate, uint256 periodFinish);

    constructor(address _divs, address _weth, address _owner) Ownable(_owner) {
        require(_divs != address(0) && _weth != address(0), "Zero token");
        divs = IERC20(_divs);
        weth = IERC20(_weth);
        lastEmissionUpdate = block.timestamp;
    }

    // --- configuration -----------------------------------------------------

    function addPool(address token, uint256 multiplierBps) external onlyOwner returns (uint256 poolId) {
        require(token != address(0), "Zero token");
        require(multiplierBps > 0, "Zero multiplier");
        poolId = pools.length;
        pools.push(Pool({token: IERC20(token), multiplierBps: multiplierBps, exists: true}));
        emit PoolAdded(poolId, token, multiplierBps);
    }

    /// @dev Only affects weights recomputed after this call. Existing positions keep
    /// their weight until their next interaction, which avoids an unbounded loop
    /// over every staker.
    function setPoolMultiplier(uint256 poolId, uint256 multiplierBps) external onlyOwner {
        require(pools[poolId].exists, "No pool");
        require(multiplierBps > 0, "Zero multiplier");
        pools[poolId].multiplierBps = multiplierBps;
        emit PoolMultiplierUpdated(poolId, multiplierBps);
    }

    function setTiers(uint256[] calldata thresholds, uint256[] calldata multipliersBps) external onlyOwner {
        require(thresholds.length == multipliersBps.length, "Length mismatch");
        require(thresholds.length <= 8, "Too many tiers");
        for (uint256 i = 0; i < thresholds.length; i++) {
            require(multipliersBps[i] >= BPS, "Tier below 1x");
            if (i > 0) require(thresholds[i] > thresholds[i - 1], "Thresholds not ascending");
        }
        tierThresholds = thresholds;
        tierMultipliersBps = multipliersBps;
        emit TiersUpdated(thresholds, multipliersBps);
    }

    /// @notice Fund an emission period. The rate is derived from the DIVS that
    /// actually arrived rather than set independently, so emissions cannot be
    /// promised without backing. Accrual halts at `periodFinish` unless renewed.
    /// @dev Calling mid-period rolls the unspent remainder into the new one.
    function notifyEmission(uint256 amount, uint256 duration) external onlyOwner nonReentrant {
        require(amount > 0, "Zero amount");
        require(duration > 0, "Zero duration");
        _updateEmissions();

        uint256 before = divs.balanceOf(address(this));
        divs.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = divs.balanceOf(address(this)) - before;
        require(received > 0, "Nothing received");

        emissionReserve += received;
        emissionsFunded += received;

        uint256 rate;
        if (block.timestamp >= periodFinish) {
            rate = received / duration;
        } else {
            uint256 remaining = (periodFinish - block.timestamp) * emissionRate;
            rate = (received + remaining) / duration;
        }
        require(rate > 0, "Rate rounds to zero");
        // The unaccrued budget is the only thing a period may draw on. Staked
        // principal is excluded because `emissionsFunded` counts funding alone.
        require(rate * duration <= emissionsFunded - emissionsAccrued, "Insufficient emission budget");

        emissionRate = rate;
        lastEmissionUpdate = block.timestamp;
        periodFinish = block.timestamp + duration;
        emit EmissionNotified(received, rate, periodFinish);
    }

    // --- fee intake --------------------------------------------------------

    /// @notice Route collected trading fees to stakers. Permissionless by design:
    /// the WETH is pulled from the caller before any accounting moves, so an
    /// unauthorised caller can only donate.
    function notifyFee(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        uint256 before = weth.balanceOf(address(this));
        weth.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = weth.balanceOf(address(this)) - before;

        uint256 distributable = received + unallocatedFees;
        if (totalWeight == 0) {
            // Nothing staked; hold it rather than dividing by zero or burning it.
            unallocatedFees = distributable;
        } else {
            unallocatedFees = 0;
            accWethPerWeight += (distributable * ACC_PRECISION) / totalWeight;
        }
        emit FeeNotified(msg.sender, received);
    }

    // --- staking -----------------------------------------------------------

    function stake(uint256 poolId, uint256 amount, uint256 lockWeeks) external nonReentrant {
        require(pools[poolId].exists, "No pool");
        require(amount > 0, "Zero amount");
        require(lockWeeks <= MAX_LOCK_WEEKS, "Lock too long");

        Position storage pos = positions[poolId][msg.sender];
        // A new lock may not shorten an existing one; the stake is already committed.
        uint64 newLockEnd = uint64(block.timestamp + lockWeeks * WEEK);
        require(newLockEnd >= pos.lockEnd, "Cannot shorten lock");

        _settle(msg.sender);

        IERC20 token = pools[poolId].token;
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        require(received > 0, "Nothing received");

        pos.amount += received;
        pos.lockEnd = newLockEnd;
        pos.lockWeeks = uint32(lockWeeks);
        if (address(token) == address(divs)) totalStakedDivs += received;

        _applyWeight(poolId, msg.sender);
        emit Staked(msg.sender, poolId, received, lockWeeks, pos.weight);
    }

    function extendLock(uint256 poolId, uint256 lockWeeks) external nonReentrant {
        require(lockWeeks <= MAX_LOCK_WEEKS, "Lock too long");
        Position storage pos = positions[poolId][msg.sender];
        require(pos.amount > 0, "No position");

        uint64 newLockEnd = uint64(block.timestamp + lockWeeks * WEEK);
        require(newLockEnd > pos.lockEnd, "Not an extension");

        _settle(msg.sender);
        pos.lockEnd = newLockEnd;
        pos.lockWeeks = uint32(lockWeeks);
        _applyWeight(poolId, msg.sender);
        emit LockExtended(msg.sender, poolId, lockWeeks, pos.weight);
    }

    function unstake(uint256 poolId, uint256 amount) external nonReentrant {
        Position storage pos = positions[poolId][msg.sender];
        require(amount > 0 && amount <= pos.amount, "Bad amount");
        require(block.timestamp >= pos.lockEnd, "Still locked");

        _settle(msg.sender);

        pos.amount -= amount;
        if (pos.amount == 0) {
            pos.lockWeeks = 0;
            pos.lockEnd = 0;
        }

        IERC20 token = pools[poolId].token;
        if (address(token) == address(divs)) totalStakedDivs -= amount;

        _applyWeight(poolId, msg.sender);
        token.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, poolId, amount, pos.weight);
    }

    function claim() external nonReentrant returns (uint256 wethOut, uint256 divsOut) {
        _settle(msg.sender);
        Rewards storage r = rewards[msg.sender];

        wethOut = r.pendingWeth;
        divsOut = r.pendingDivs;
        // Backstop only: `notifyEmission` will not schedule more than the funded
        // budget, so this cap should be unreachable. It stays because the
        // alternative failure is paying emissions out of staked principal.
        if (divsOut > emissionReserve) divsOut = emissionReserve;

        r.pendingWeth = 0;
        r.pendingDivs -= divsOut;
        emissionReserve -= divsOut;

        if (wethOut > 0) weth.safeTransfer(msg.sender, wethOut);
        if (divsOut > 0) divs.safeTransfer(msg.sender, divsOut);
        emit Claimed(msg.sender, wethOut, divsOut);
    }

    // --- weights -----------------------------------------------------------

    function lockMultiplierBps(uint256 lockWeeks) public pure returns (uint256) {
        if (lockWeeks == 0) return BPS;
        if (lockWeeks >= MAX_LOCK_WEEKS) return MAX_LOCK_BPS;
        return BPS + ((MAX_LOCK_BPS - BPS) * lockWeeks) / MAX_LOCK_WEEKS;
    }

    function tierMultiplierBps(uint256 amount) public view returns (uint256) {
        uint256 mult = BPS;
        for (uint256 i = 0; i < tierThresholds.length; i++) {
            if (amount >= tierThresholds[i]) mult = tierMultipliersBps[i];
        }
        return mult;
    }

    /// @notice The weight a position would carry right now. Once a lock expires the
    /// boost lapses, so this can be below the stored weight until the next
    /// interaction (or a `poke`) realises it.
    function currentWeight(uint256 poolId, address user) public view returns (uint256) {
        Position memory pos = positions[poolId][user];
        if (pos.amount == 0) return 0;

        uint256 lockBps = block.timestamp >= pos.lockEnd ? BPS : lockMultiplierBps(pos.lockWeeks);
        uint256 combined = (pools[poolId].multiplierBps * tierMultiplierBps(pos.amount)) / BPS;
        combined = (combined * lockBps) / BPS;
        return (pos.amount * combined) / BPS;
    }

    /// @notice Realise an expired lock's weight drop. Permissionless, because a
    /// staker has no incentive to demote themselves and the boost would otherwise
    /// outlive the lock that paid for it.
    function poke(uint256 poolId, address user) external nonReentrant {
        require(positions[poolId][user].amount > 0, "No position");
        _settle(user);
        _applyWeight(poolId, user);
    }

    function _applyWeight(uint256 poolId, address user) internal {
        Position storage pos = positions[poolId][user];
        uint256 oldWeight = pos.weight;
        uint256 newWeight = currentWeight(poolId, user);

        if (newWeight != oldWeight) {
            pos.weight = newWeight;
            Rewards storage r = rewards[user];
            r.weight = r.weight - oldWeight + newWeight;
            totalWeight = totalWeight - oldWeight + newWeight;
        }
        _resetDebt(user);
    }

    // --- reward accounting -------------------------------------------------

    /// @notice Emissions accrue only up to the end of the funded period.
    function lastTimeEmissionApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function _updateEmissions() internal {
        uint256 applicable = lastTimeEmissionApplicable();
        if (applicable > lastEmissionUpdate) {
            if (totalWeight > 0 && emissionRate > 0) {
                // Time passing with nothing staked emits nothing, leaving that
                // budget unaccrued and available to a later period.
                uint256 emitted = (applicable - lastEmissionUpdate) * emissionRate;
                emissionsAccrued += emitted;
                accDivsPerWeight += (emitted * ACC_PRECISION) / totalWeight;
            }
        }
        if (block.timestamp > lastEmissionUpdate) lastEmissionUpdate = block.timestamp;
    }

    function _settle(address user) internal {
        _updateEmissions();
        Rewards storage r = rewards[user];
        if (r.weight > 0) {
            r.pendingWeth += (r.weight * accWethPerWeight) / ACC_PRECISION - r.wethDebt;
            r.pendingDivs += (r.weight * accDivsPerWeight) / ACC_PRECISION - r.divsDebt;
        }
        _resetDebt(user);
    }

    function _resetDebt(address user) internal {
        Rewards storage r = rewards[user];
        r.wethDebt = (r.weight * accWethPerWeight) / ACC_PRECISION;
        r.divsDebt = (r.weight * accDivsPerWeight) / ACC_PRECISION;
    }

    // --- views -------------------------------------------------------------

    function pendingRewards(address user) external view returns (uint256 pendingWeth, uint256 pendingDivs) {
        Rewards memory r = rewards[user];
        uint256 accDivs = accDivsPerWeight;
        uint256 applicable = lastTimeEmissionApplicable();
        if (applicable > lastEmissionUpdate && totalWeight > 0 && emissionRate > 0) {
            accDivs += ((applicable - lastEmissionUpdate) * emissionRate * ACC_PRECISION) / totalWeight;
        }
        pendingWeth = r.pendingWeth;
        pendingDivs = r.pendingDivs;
        if (r.weight > 0) {
            pendingWeth += (r.weight * accWethPerWeight) / ACC_PRECISION - r.wethDebt;
            pendingDivs += (r.weight * accDivs) / ACC_PRECISION - r.divsDebt;
        }
    }

    function poolCount() external view returns (uint256) {
        return pools.length;
    }
}
