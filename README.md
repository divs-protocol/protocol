# DIVS Protocol

Yield stripping for tokenized stocks. Depositors hand the vault a rebasing
ERC-8056 stock token; the vault separates the dividend growth — the rise in the
token's `uiMultiplier` — from the principal and pays it out as harvestable
yield, minus a protocol fee.

## Layout

| Path         | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `src/`       | Next.js 16 dashboard (App Router, Tailwind 4, wagmi + viem)        |
| `contracts/` | Hardhat 3 project: `DivsVault.sol` and its Solidity test suite     |

The two halves are **separate npm projects on purpose**. The root uses pnpm; the
Hardhat project keeps its own `package-lock.json` and `node_modules` and is
installed with npm. Install and run them independently.

## Vault accounting

A position is stored as `{ rawAmount, entryMultiplier }`, and the depositor's
claim on the vault is always:

```
claim = rawAmount * currentMultiplier / entryMultiplier
```

`rawAmount` is denominated in token units *as of `entryMultiplier`*, never in raw
display units, so every conversion in and out scales through that ratio. Three
consequences worth knowing before changing anything in `DivsVault.sol`:

- **Yield is proportional, not absolute.** `pendingYield` divides by
  `entryMultiplier`, not by a fixed `1e18`. Dividing by a constant overpays
  anyone who entered above 1e18 and does so out of other depositors' principal.
- **Deposits credit the balance delta**, not the requested amount. Rebasing
  tokens floor the share conversion and fee-on-transfer tokens skim; crediting
  the request leaves the vault permanently short, and the gap compounds with
  every later rebase.
- **A downward rebase falls on the depositor holding it.** `withdraw` scales the
  principal to the live multiplier, so a fall in the underlying is not
  socialised onto everyone else.

The vault pays yield out of its own token balance, which is solvent **only
because the token genuinely rebases `balanceOf`**. If `uiMultiplier` were a
display-only figure, every harvest would be funded from the next deposit. See
`test_PendingYieldEqualsActualVaultBalanceGrowth`.

## Contracts

```bash
cd contracts && npm install
```

```bash
cd contracts && npx hardhat test
```

Solidity unit tests live in `contracts/DivsVault.t.sol` and run on forge-std.
`MockStockToken` is a share-based rebasing ERC-8056 token used to drive them.

Deploy:

```bash
cd contracts && npx hardhat ignition deploy ignition/modules/DivsVault.ts --network sepolia
```

`feeCollector` defaults to the deploying account; override it with a parameters
file (see the header of `ignition/modules/DivsVault.ts`). Sepolia needs
`SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` set via `npx hardhat keystore set`.

## Web app

```bash
pnpm install && pnpm dev
```

Point the Vaults tab at a deployment by creating `.env.local`:

```
NEXT_PUBLIC_DIVS_VAULT_ADDRESS=0x...
NEXT_PUBLIC_STOCK_TOKEN_ADDRESS=0x...
```

Without those, the Vaults tab renders a configuration notice instead of calling
into the zero address.

### Driving it against a local chain

The fastest way to exercise deposit/harvest/withdraw for real. Three terminals:

```bash
cd contracts && npm run node
```

```bash
cd contracts && npm run deploy:local
```

`deploy:local` deploys a `MockStockToken` + `DivsVault` pair, mints 1000 MSTK to
the first account, and writes both addresses into `.env.local` for you.

```bash
pnpm dev
```

Point your wallet at `http://127.0.0.1:8545` (chain 31337) and open the Vaults
tab. To simulate a dividend — or a downward correction — move the multiplier:

```bash
cd contracts && npm run rebase --multiplier=1.5
```

The panel watches the chain head, so pending yield updates on the next block
without a reload. Chain 31337 is only offered in development builds; override
its RPC with `NEXT_PUBLIC_LOCAL_RPC_URL`, or force it into a preview build with
`NEXT_PUBLIC_ENABLE_LOCAL_CHAIN=true`.

```bash
pnpm build && pnpm lint && pnpm typecheck
```

> **Note on the rest of the dashboard.** Only the Vaults tab is wired to a
> contract. The order book, price chart, stakes and positions tables are still
> hard-coded placeholders — there is no price feed or indexer behind them yet.
