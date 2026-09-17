# DIVS Protocol

Exchange for tokenized equities on Robinhood Chain (4663). Equities and ETFs
trade against on-chain pools; the router charges a fee on the WETH side of every
trade and forwards it to the staking vault, which distributes it to staked
positions by weight.

The listed set is whichever Robinhood Stock Tokens have a Uniswap pool holding
liquidity, so it grows as pools are seeded. `src/lib/exchange.ts` holds the
registry.

$DIVS is launched on Pons and is not deployed from this repository.

## Layout

| Path | Contents |
| --- | --- |
| `src/` | Next.js 16 application — App Router, Tailwind 4, wagmi, viem |
| `contracts/` | Hardhat 3 project — Solidity sources and test suite |

The two halves are separate package projects. The application uses pnpm; the
Hardhat project keeps its own lockfile and is installed with npm.

## Contracts

| Contract | Responsibility |
| --- | --- |
| `DivsStaking` | Holds stake, tracks weight, distributes WETH fees and DIVS emissions |
| `DivsRouter` | Executes trades against the pools and charges the protocol fee |

### Weight and distribution

```
weight = amount × poolMultiplier × tierMultiplier × lockMultiplier
claim  = weight × accWethPerWeight − debt
```

Both pools share one global weight space, so `poolMultiplier` is the owner-set
exchange rate between a staked DIVS and a staked LP token. `lockMultiplier` runs
1× flexible to 4× at a 52-week lock; `tierMultiplier` is threshold-based on
position size.

Any weight change settles outstanding rewards into `pending` before it takes
effect, so every mutating path routes through `_settle`. `poke` is
permissionless: a staker has no incentive to demote their own expired lock, and
an expired boost dilutes everyone still locked until it is realised.

### Solvency

- `notifyFee` transfers the WETH in before raising the accumulator, so the
  contract cannot record an entitlement it does not hold. It is permissionless —
  an unauthorised caller can only donate.
- `notifyEmission(amount, duration)` pulls the DIVS in and derives the rate from
  what arrived. Accrual stops at `periodFinish` unless a further period is
  funded. $DIVS is both staked and emitted, so `emissionsFunded` counts explicit
  funding only and `totalStakedDivs` is never drawn on.

Both are asserted under fuzzing: WETH paid never exceeds WETH notified, and
principal is always recoverable.

### Fee routing

`DivsRouter` charges on the WETH side either way — deducted from the input when
buying, from the proceeds when selling — so staking only ever receives one
asset. Swaps execute directly against each pool rather than through a periphery
router; the expected pool is held in transient storage across the callback, so a
callback from any other address reverts. Fees accrue in the router and flush
past a threshold; `flushFees` is permissionless.

Default fee is 10 bps, owner-settable, capped at 100 bps in the setter.

## Development

```bash
pnpm install && pnpm dev
```

```bash
pnpm build && pnpm lint && pnpm typecheck
```

### Contracts

```bash
cd contracts && npm install && npx hardhat test
```

### Against a local chain

Two terminals:

```bash
cd contracts && npm run node
```

```bash
cd contracts && npm run deploy:local
```

`deploy:local` deploys the vault and the router against mock tokens and a mock
pool, wires both staking pools, funds an emission period, stakes a locked
position, and puts a trade through the router so the fee arrives the way it does
in production.

Chain 31337 is offered in development builds only. Override its endpoint with
`NEXT_PUBLIC_LOCAL_RPC_URL`, or enable it in a preview build with
`NEXT_PUBLIC_ENABLE_LOCAL_CHAIN=true`.

## Deployment

```bash
cd contracts && npx hardhat ignition deploy ignition/modules/DivsProtocol.ts --network robinhood \
  --parameters '{"DivsProtocol":{"divs":"<pons token>","weth":"0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73","owner":"<owner>"}}'
```

The application reads deployed addresses from the environment:
`NEXT_PUBLIC_DIVS_TOKEN_ADDRESS`, `NEXT_PUBLIC_DIVS_STAKING_ADDRESS`,
`NEXT_PUBLIC_DIVS_ROUTER_ADDRESS`, `NEXT_PUBLIC_DIVS_LP_ADDRESS`. Staking and
trading stay disabled while they are unset rather than failing when used.
