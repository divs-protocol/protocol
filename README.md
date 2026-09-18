# DIVS Protocol

[![CI](https://github.com/divs-protocol/protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/divs-protocol/protocol/actions/workflows/ci.yml)

Exchange for tokenized equities on Robinhood Chain (4663). Equities and ETFs
trade against on-chain pools; the router charges a fee on the WETH side of every
trade and forwards it to the staking vault, which distributes it to staked
positions by weight.

The listed set is whichever Robinhood Stock Tokens have a Uniswap pool holding
liquidity, so it grows as pools are seeded. `src/lib/exchange.ts` holds the
registry.

$DIVS is launched on Pons and is not deployed from this repository.

[SECURITY.md](SECURITY.md) is the technical and security overview: contract
responsibilities, the invariants the test suite enforces, the approval policy,
and the known limitations.

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

### Generated data

Two files are written by scripts rather than by hand, and neither should be
edited directly.

`src/lib/exchange.ts` holds the market registry, rebuilt from the chain:

```bash
node scripts/scan-markets.mjs --write
```

`src/lib/ciks.ts` maps each listed stock to its SEC filer number, which is what
the insider panels look up. It reads the tickers back out of the registry, so
run it after a scan adds markets:

```bash
node scripts/fetch-ciks.mjs --write
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

Two contracts are deployed: `DivsStaking` and `DivsRouter`. $DIVS itself comes
from Pons, the stock tokens are Robinhood's and the pools are Uniswap's, so none
of those are deployed or owned here.

### 1. Configure the key

The deploy key lives in Hardhat's keystore, never in a file or shell history.

```bash
cd contracts && npx hardhat keystore set ROBINHOOD_PRIVATE_KEY
```

```bash
cd contracts && npx hardhat keystore set ROBINHOOD_RPC_URL
```

### 2. Deploy

```bash
cd contracts && npx hardhat ignition deploy ignition/modules/DivsProtocol.ts --network robinhood --parameters params.json
```

`params.json`:

```json
{
  "DivsProtocol": {
    "divs": "<the Pons token>",
    "weth": "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    "usdg": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    "usdgWethPool": "0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a",
    "owner": "<multisig>",
    "feeBps": 10
  }
}
```

`owner` should be a multisig, not the deploy key. It can change the fee within
the 1% cap, the pool multipliers and the tier table. It cannot withdraw user
funds, mint, or seize a stake, but a single key is still a single point of
failure, so move it before anyone stakes rather than after.

Both contracts are deployed owned by the deploying account and then handed over,
rather than constructed under `owner`. The initial pool configuration is
`onlyOwner`, so constructing under a multisig would revert the deployment
partway through.

### 3. Accept ownership from the multisig

The transfer is two-step. Ignition nominates `owner`; nothing moves until the
multisig calls `acceptOwnership` on each contract. Until it does, the deploy key
still holds both, which is what makes a wrong address at step 2 recoverable.

From the Safe, one transaction per contract, no arguments:

```
DivsStaking.acceptOwnership()
DivsRouter.acceptOwnership()
```

Then confirm `owner()` returns the Safe on both, and that the deploy key no
longer does. That check is the point of the exercise; skipping it means you do
not know who owns the protocol.

### 4. Verify the source

So the explorer shows readable Solidity at the address and anyone can confirm
the bytecode matches this repository.

```bash
cd contracts && npx hardhat verify --network robinhood <staking address> <divs> <weth> <owner>
```

```bash
cd contracts && npx hardhat verify --network robinhood <router address> <weth> <usdg> <usdgWethPool> <staking> 10 <owner>
```

Constructor arguments must be given in the same order the contract declares
them, or verification fails without saying why.

### 5. Point the application at them

The application reads deployed addresses from the environment:
`NEXT_PUBLIC_DIVS_TOKEN_ADDRESS`, `NEXT_PUBLIC_DIVS_STAKING_ADDRESS`,
`NEXT_PUBLIC_DIVS_ROUTER_ADDRESS`, `NEXT_PUBLIC_DIVS_LP_ADDRESS`. Staking and
trading stay disabled while they are unset rather than failing when used.

Set them in the hosting environment and redeploy. `NEXT_PUBLIC_` values are
compiled in at build time, so an existing deployment will not pick them up.

### 6. Publish the addresses

Record them in `SECURITY.md` and on the site. When a clone appears, and one
will, that record is what people check against.

## License

MIT. See [LICENSE](LICENSE).
