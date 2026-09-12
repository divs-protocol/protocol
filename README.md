<div align="center">

<img src="public/logo.png" alt="DIVS" height="72" />

### DIVS Protocol

Decentralized exchange for tokenized equities on Robinhood Chain.<br />
Instant settlement, markets that never close, and every trading fee paid to $DIVS stakers.

[divsprotocol.com](https://www.divsprotocol.com) · [Documentation](https://www.divsprotocol.com/docs) · [@DIVSProtocol](https://x.com/DIVSProtocol)

</div>

---

Seventeen equities and ETFs trade continuously against on-chain pools. A trade
settles in the block it lands in — no market hours, no settlement period, no
broker between a wallet and a pool.

Fees are not revenue the protocol retains. The router charges on the WETH side
of every trade and forwards the proceeds to the staking vault, which distributes
them to staked positions by weight.

### Protocol

| | |
| --- | --- |
| Chain | Robinhood Chain · 4663 |
| Markets | 17 equities and ETFs |
| Assets | Robinhood Stock Tokens (ERC-8056) |
| Protocol fee | 10 bps, charged in WETH, capped at 100 bps |
| Staking | Single-sided $DIVS and DIVS/WETH LP |
| Lock multiplier | 1× flexible to 4× at 52 weeks |

Weight is the staked amount multiplied by three independent multipliers — pool,
size tier and lock duration — and a position's share of every distribution is
proportional to it.

```
weight = amount × poolMultiplier × tierMultiplier × lockMultiplier
claim  = weight × accWethPerWeight − debt
```

### Contracts

| Contract | Responsibility |
| --- | --- |
| `DivsStaking` | Holds stake, tracks weight, distributes WETH fees and DIVS emissions |
| `DivsRouter` | Executes trades against the pools and charges the protocol fee |

$DIVS is launched on Pons and is not deployed from this repository. Deployed
addresses are published at launch.

Two invariants are structural rather than assumed. `notifyFee` transfers WETH in
before raising the accumulator, so the contract cannot record an entitlement it
does not hold. `notifyEmission` pulls the DIVS in and derives the rate from what
arrived, so emissions cannot be scheduled beyond what funds them — and since
$DIVS is both staked and emitted, the reward budget is tracked apart from
deposits. Both are covered by fuzzed tests; the suite is 40 tests.

### Repository

| Path | Contents |
| --- | --- |
| `src/` | Next.js 16 application — App Router, Tailwind 4, wagmi, viem |
| `contracts/` | Hardhat 3 project — Solidity sources and test suite |

The two halves are separate package projects. The application uses pnpm; the
Hardhat project keeps its own lockfile and is installed with npm.

### Development

```bash
pnpm install && pnpm dev
```

```bash
pnpm build && pnpm lint && pnpm typecheck
```

Contracts:

```bash
cd contracts && npm install && npx hardhat test
```

Against a local chain, in two terminals:

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
