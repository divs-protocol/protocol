# DIVS Protocol — Technical and Security Overview

Version 1.0, 18 September 2026

This document describes what DIVS Protocol is, what its contracts do, what
properties they guarantee, and what they do not. It is written for a security
reviewer.

---

## 1. What the protocol is

DIVS Protocol is a non-custodial interface for trading tokenized equities on
Robinhood Chain (chain ID 4663).

Robinhood issues ERC-20 tokens that track listed securities — AAPL, NVDA, SPY,
GLD and others. Those tokens trade in Uniswap V3 pools on the same chain. DIVS
does not issue them, hold them, or operate those pools. It reads them, presents
them, and routes trades into them.

98 markets are listed. A market appears when its pool holds liquidity; the list
is generated from the chain by `scripts/scan-markets.mjs` rather than curated.

The protocol's own contribution is a fee. A trade routed through DIVS pays a
protocol fee on top of the pool's own fee, and that fee is distributed to
holders who stake the $DIVS token. The protocol retains nothing.

**Custody model: none.** The contracts never hold user funds between
transactions. A trade moves assets from the trader, through a pool, back to the
trader, in one call. Staked $DIVS is held by the vault and is withdrawable by
its owner subject only to a lock the staker chose.

---

## 2. Contracts

Two contracts, both in `contracts/contracts/`.

### DivsRouter

Executes a trade against one Uniswap V3 pool and charges the protocol fee in
the same call.

| Function | Effect |
| --- | --- |
| `buy(pool, amountIn, amountOutMin, recipient)` | Spends the pool's quote asset, returns the stock token |
| `buyWithETH(pool, amountOutMin, recipient)` | As above, wrapping native ether. WETH-quoted markets only |
| `sell(pool, amountIn, amountOutMin, recipient, unwrap)` | Spends the stock token, returns the quote asset |
| `flushFees()` | Sends accumulated fees to the vault. Permissionless |

Markets are quoted in one of two assets: WETH or USDG. The fee is taken on the
quote side of the trade, never in the stock token, so the router never holds an
equity position between transactions. A USDG fee is converted to WETH through
the WETH/USDG reference pool before it reaches the vault.

`_quoteOf` reverts on a pair quoted in neither asset rather than guessing.

**Swap execution.** Swaps call the pool directly and implement
`uniswapV3SwapCallback`, rather than going through a periphery router. The pool
this contract is currently calling is held in transient storage and cleared
after; a callback from any other address reverts. Transient storage cannot
survive the transaction, so the authorisation cannot leak between calls.

**Slippage.** Every entry point takes `amountOutMin` and reverts below it. The
pool is swapped to its price limit, so protection is the caller's minimum, not a
price bound.

### DivsStaking

Holds staked $DIVS and DIVS/WETH LP, and distributes WETH fees and $DIVS
emissions by weight.

```
weight = amount × poolMultiplier × tierMultiplier × lockMultiplier
claim  = weight × accWethPerWeight − debt
```

`lockMultiplier` runs 1× flexible to 4× at a 52-week lock. A lock cannot be
shortened and has no early exit.

---

## 3. Security properties

These are enforced by the structure of the code, not by convention, and each is
covered by a named test.

### Fees cannot be promised before they arrive

`notifyFee` transfers WETH into the vault and only then raises the accumulator.
The contract cannot record an entitlement it is not holding. It is
permissionless: because the WETH is pulled from the caller, an unauthorised call
can only donate.

> `testFuzz_WethPaidNeverExceedsWethNotified` — fuzzed over stake sizes, fee
> amounts, pool multipliers and lock lengths.

### Emissions cannot exceed their funding

`notifyEmission(amount, duration)` pulls the $DIVS in and derives the per-second
rate from what arrived, rather than accepting a rate on trust. Accrual stops at
`periodFinish` unless a further period is funded.

$DIVS is both a staked and an emitted asset, so `emissionsFunded` counts
explicit funding only and `totalStakedDivs` is never drawn on. Principal cannot
be paid out as rewards.

> `test_StakedPrincipalIsNeverEmitted`,
> `test_EmissionsCannotBeScheduledWithoutFunding`,
> `test_NotifyEmissionDerivesRateFromAmountFunded`

### Principal is always recoverable

Any weight change settles outstanding rewards into `pending` before it takes
effect, so no path can strand a balance.

> `testFuzz_PrincipalAlwaysRecoverable`

### Fees are exact and conserved

Every wei charged as a fee reaches the vault. None is stranded in the router.

> `testFuzz_FeeIsExactAndConserved` — fuzzed over trade size and fee rate.

### The swap callback cannot be forged

> `test_CallbackRejectsUnexpectedCaller`

### The fee is capped in the setter

`MAX_FEE_BPS` is 100 (1%). The owner can lower the fee at any time and can never
raise it above the cap.

> `test_FeeIsCapped`, `test_OnlyOwnerSetsFee`

---

## 4. Approvals

**All ERC-20 approvals request the exact amount being transacted.** There is no
unlimited allowance anywhere in the application or the contracts.

This was not always true. Until 18 September 2026 the staking screen requested
`approve(spender, type(uint256).max)`. That was a defect in the frontend, it was
removed, and the current behaviour is verifiable in the deployed JavaScript
bundle: no `approve` call carries a max-uint argument.

The frontend contains no offline signature logic — no `eth_signTypedData_v4`,
no `permit`, no `setApprovalForAll`.

---

## 5. Test suite

52 tests, all passing, in `contracts/contracts/*.t.sol`. Run with
`cd contracts && npx hardhat test`.

Three are fuzzed invariants at 256 runs each:

- `testFuzz_WethPaidNeverExceedsWethNotified`
- `testFuzz_PrincipalAlwaysRecoverable`
- `testFuzz_FeeIsExactAndConserved`

The remainder cover lock boundaries, tier thresholds, emission periods,
permissionless paths, access control, revert conditions and both quote assets.

---

## 6. Known limitations

Stated plainly, because a review that discovers these independently is worse
than one that is told.

**No third-party audit.** The contracts have not been audited by an external
firm. The test suite and the invariants above are what exists.

**Owner powers.** The staking owner can change a pool multiplier, change the
tier table and fund emission periods. The router owner can change the fee within
the 1% cap, change the staking address, and change the flush thresholds. Neither
owner can withdraw user funds, mint, pause a position, or seize a stake. The
owner is currently a single key; a multisig is intended before meaningful value
is staked.

Ownership transfers in two steps on both contracts: the nominee has to call
`acceptOwnership`, so a transfer to an address that cannot transact does not
silently lose configuration control.

**Issuer pause.** Every Robinhood Stock Token is pausable by its issuer. While a
token is paused, transfers of it fail and its market cannot trade. This is a
property of the underlying assets, not of this protocol, and the application
reads `paused()` per token rather than assuming.

**Price impact is not quoted.** Quotes use the pool's marginal price and ignore
the impact of the trade itself. The `amountOutMin` the user submits is what
protects them.

**USDG conversion timing.** Fees taken in USDG sit in the router until a flush
threshold is crossed, then convert through the reference pool at whatever rate
holds at that moment. A staker's realised fee therefore depends slightly on when
the flush happens.

**V3 pools only.** `DivsRouter` calls `IUniswapV3Pool.swap` directly, so only
markets with a V3 pool are tradeable. Tokens with liquidity only in a V2 pair or
a V4 pool are listed nowhere and trade nowhere through this protocol - V2 uses a
different swap interface, and V4 has no pools to call at all, only one shared
`PoolManager` reached through an `unlock` callback. Both are separate routing
work, not a configuration change.

---

## 7. Deployment status

**`DivsRouter` is deployed and verified** on Robinhood Chain (4663), at
[`0xd8B82A06892c61a3d36D397d64595607Dc8101e8`](https://robinhoodchain.blockscout.com/address/0xd8B82A06892c61a3d36D397d64595607Dc8101e8).
It was deployed with no staking address, via
[`DivsRouterOnly.ts`](contracts/ignition/modules/DivsRouterOnly.ts), so trading
does not wait on $DIVS. Source is public and matches the deployed bytecode.

**`DivsStaking` is not deployed.** $DIVS has not launched yet - it launches on
Pons, and is not deployed from this repository or owned by the protocol. Fees
accrue inside the router in the meantime (`pendingFees`, `pendingUsdgFees`) and
are not lost; once the vault exists, `setStaking` then `flushFees` pays out
everything collected up to that point. See "Trading does not wait for the
token" in the [README](README.md) for the mechanics and the test that covers
this sequence.

Routing today covers Uniswap V3 pools only. V2 and V4 pools are not yet
reachable from this router - see §6 above, "V3 pools only," for why the pool
interfaces differ and what routing each one would take.

---

## 8. Application

Next.js 16, wagmi, viem. Wallet connection is Reown AppKit 1.7.18.

Chain reads are proxied through a first-party route (`/api/rpc`) because the
public Robinhood Chain endpoint sends `Access-Control-Allow-Origin` twice, which
browsers reject. **That proxy forwards a read-only method allowlist and refuses
`eth_sendRawTransaction`**, so it is not in the signing path. Transactions are
signed and broadcast by the user's wallet over its own connection.

One external source is read besides the chain. The insider-dealings panels fetch
SEC Form 4 filings from `sec.gov` and `data.sec.gov`, server side, through
`/api/insider`. Those requests carry no user data, are cached for an hour, and
their responses are parsed into a fixed row shape rather than rendered as
markup. A failure there empties a panel and changes nothing else.

---

## Reporting a vulnerability

Email **valeinfralabs@gmail.com**. Please allow time to respond before public
disclosure.

| | |
| --- | --- |
| Site | https://www.divsprotocol.com |
| Documentation | https://www.divsprotocol.com/docs |
| X | https://x.com/DIVSProtocol |
| Chain | Robinhood Chain, 4663 |
