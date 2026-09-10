# DIVS Protocol

A community-owned exchange for tokenized stocks. Traders buy and sell stock
tokens 24/7 on the launchpad; the trading fees that a brokerage would keep are
routed back to DIVS stakers instead.

$DIVS is the cash-flow token. Users stake **DIVS** (single-sided) or **DIVS/WETH
LP**, and earn a weighted share of collected fees plus DIVS emissions. Stock
tokens are the asset traded on the platform — they are never staked.

## Layout

| Path         | What it is                                                      |
| ------------ | --------------------------------------------------------------- |
| `src/`       | Next.js 16 dashboard (App Router, Tailwind 4, wagmi + viem)      |
| `contracts/` | Hardhat 3 project: `DivsStaking.sol` and its Solidity test suite |

The two halves are **separate npm projects on purpose**. The root uses pnpm; the
Hardhat project keeps its own `package-lock.json` and `node_modules` and is
installed with npm. Install and run them independently.

## Staking accounting

Fees arrive as WETH and are distributed through a single accumulator. A staker's
claim is:

```
claim = weight * accWethPerWeight - debt
weight = amount * poolMultiplier * tierMultiplier * lockMultiplier
```

Both pools share one global weight space, so `poolMultiplier` is the governance
-set exchange rate between a staked DIVS and a staked LP token. `lockMultiplier`
runs 1x flexible to 4x at a 52-week lock; `tierMultiplier` is threshold-based on
position size.

Two rules carry solvency, and both are enforced structurally rather than assumed:

- **Fees are pulled in before they are distributed.** `notifyFee` transfers the
  WETH first and only then raises the accumulator, so the contract cannot promise
  revenue it does not hold. It is permissionless — an unauthorised caller can
  only donate.
- **Emissions are funded before they are scheduled.** `notifyEmission(amount,
  duration)` pulls the DIVS in and *derives* the rate from what arrived, rather
  than taking a rate on trust. Accrual stops at `periodFinish` unless a new
  period is funded, so the contract cannot build claims nothing backs. DIVS is
  both a staked and an emitted asset, so `emissionsFunded` counts explicit
  funding only and `totalStakedDivs` is never drawn on.

Any weight change must settle outstanding rewards into `pending` before it takes
effect, so every mutating path routes through `_settle`.

`poke` is permissionless: a staker has no incentive to demote their own expired
lock, and an expired boost would otherwise keep diluting everyone still locked.

Emission periods follow the Synthetix `StakingRewards` pattern: funding defines
the rate, so there is no way to promise emissions that are not held, and no
first-come-first-served race over a short reserve. Calling `notifyEmission`
mid-period rolls the unspent remainder into the new rate. Time passing with
nothing staked emits nothing, leaving that budget available for a later period.

## Contracts

```bash
cd contracts && npm install
```

```bash
cd contracts && npx hardhat test
```

Solidity tests live in `contracts/DivsStaking.t.sol` and run on forge-std,
including fuzz invariants asserting that WETH paid never exceeds WETH notified
and that principal is always recoverable.

## Web app

```bash
pnpm install && pnpm dev
```

### Driving it against a local chain

```bash
cd contracts && npm run node
```

```bash
cd contracts && npm run deploy:local
```

`deploy:local` deploys mock DIVS/WETH/LP tokens plus `DivsStaking`, wires both
pools, funds emissions, stakes a locked position, and pushes a fee through so the
accumulator is non-zero.

```bash
pnpm build && pnpm lint && pnpm typecheck
```

Chain 31337 is only offered in development builds; override its RPC with
`NEXT_PUBLIC_LOCAL_RPC_URL`, or force it into a preview build with
`NEXT_PUBLIC_ENABLE_LOCAL_CHAIN=true`.

## Status

Not launched. What exists:

- `DivsStaking.sol` — written, tested, **not audited and not deployed**
- The dashboard — every price, APR and volume in it is placeholder data. There
  is no price feed or indexer behind it.

What does not exist yet: the DIVS token, the launchpad and its Uniswap V4 pool
hook, the buy-side fee swap to WETH, the emission schedule, pause/emergency
controls, and a multisig owner. The staking contract takes token addresses in its
constructor and receives WETH via `notifyFee`, so it slots in behind the fee
distributor once that is built.
