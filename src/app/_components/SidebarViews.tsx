"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseAbiItem } from "viem";
import { useAccount, useBalance, useDisconnect, usePublicClient, useReadContracts } from "wagmi";
import { robinhood } from "wagmi/chains";
import { Copy, Check, ExternalLink, LogOut, Loader2 } from "lucide-react";
import { MARKETS, ETH_USD_POOL, poolAbi, wethPerShare, ethUsdFromSqrt } from "@/lib/exchange";
import { STOCK_TOKENS, stockTokenAbi, toDisplayShares } from "@/lib/stockTokens";
import { STAKING_ADDRESS, stakingAbi, DIVS_POOL, LP_POOL } from "@/lib/divsStaking";
import ConnectPrompt from "./ConnectPrompt";
import Footer from "./Footer";

/**
 * The wallet-specific sidebar views: Portfolio, Activity, Account, Settings.
 *
 * Each reads the connected address from Robinhood Chain. Where there is nothing
 * to show they say so rather than rendering sample rows - these describe
 * someone's own money, so an illustrative number would read as their balance.
 */

const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);

const usd = (n: number, d = 2) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const num = (n: number, d = 4) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="text-white font-bold tracking-tight text-xl mb-1">{title}</h2>
      <p className="text-[11px] text-gray-500">{sub}</p>
    </div>
  );
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#232730]">
        <span className="text-[11px] font-semibold text-white">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{label}</div>
      <div className={`font-mono text-xl ${accent ? "text-[#10B981]" : "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

/** Live USD price per ticker, from the pools. */
function usePriceMap() {
  const { data } = useReadContracts({
    contracts: [
      ...MARKETS.map(
        (m) => ({ address: m.pool, abi: poolAbi, functionName: "slot0", chainId: robinhood.id }) as const,
      ),
      { address: ETH_USD_POOL, abi: poolAbi, functionName: "slot0", chainId: robinhood.id } as const,
    ],
    query: { refetchInterval: 20_000 },
  });

  const ethRaw = data?.[MARKETS.length]?.result as readonly unknown[] | undefined;
  const ethUsd = ethRaw ? ethUsdFromSqrt(ethRaw[0] as bigint) : 0;

  const prices: Record<string, number> = {};
  MARKETS.forEach((m, i) => {
    const slot0 = data?.[i]?.result as readonly unknown[] | undefined;
    if (slot0) prices[m.ticker] = wethPerShare(m, slot0[0] as bigint) * ethUsd;
  });

  return { prices, ethUsd };
}

/* ---------------- Portfolio ---------------- */

export function PortfolioView() {
  const { address, isConnected } = useAccount();
  const { prices } = usePriceMap();

  const { data, isLoading } = useReadContracts({
    contracts: STOCK_TOKENS.flatMap(
      (t) =>
        [
          { address: t.address, abi: stockTokenAbi, functionName: "balanceOf", args: [address!], chainId: robinhood.id },
          { address: t.address, abi: stockTokenAbi, functionName: "uiMultiplier", chainId: robinhood.id },
        ] as const,
    ),
    query: { enabled: isConnected && Boolean(address) },
  });

  const { data: staking } = useReadContracts({
    contracts: [
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "positions", args: [DIVS_POOL, address!] },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "positions", args: [LP_POOL, address!] },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "pendingRewards", args: [address!] },
    ],
    query: { enabled: Boolean(STAKING_ADDRESS) && isConnected && Boolean(address) },
  });

  const holdings = STOCK_TOKENS.map((t, i) => {
    const raw = data?.[i * 2]?.result as bigint | undefined;
    const mult = data?.[i * 2 + 1]?.result as bigint | undefined;
    const shares = raw !== undefined && mult !== undefined ? Number(formatUnits(toDisplayShares(raw, mult), 18)) : 0;
    const price = prices[t.ticker] ?? 0;
    return { token: t, shares, price, value: shares * price };
  })
    .filter((h) => h.shares > 0)
    .sort((a, b) => b.value - a.value);

  const total = holdings.reduce((s, h) => s + h.value, 0);
  const divsStaked = (staking?.[0]?.result as readonly bigint[] | undefined)?.[0] ?? 0n;
  const lpStaked = (staking?.[1]?.result as readonly bigint[] | undefined)?.[0] ?? 0n;
  const rewards = staking?.[2]?.result as readonly [bigint, bigint] | undefined;

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <Head title="Portfolio" sub="Your stock tokens and staking position." />
        <ConnectPrompt what="Your portfolio" />
        <Footer />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Head title="Portfolio" sub="Your stock tokens and staking position, live from chain 4663." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Holdings value" value={total ? usd(total) : "$0.00"} sub={`${holdings.length} markets`} />
        <Stat label="DIVS staked" value={num(Number(formatUnits(divsStaked, 18)))} sub="single-sided" />
        <Stat label="LP staked" value={num(Number(formatUnits(lpStaked, 18)))} sub="DIVS/WETH" />
        <Stat
          label="Claimable fees"
          value={rewards ? num(Number(formatUnits(rewards[0], 18))) : "0"}
          sub="WETH"
          accent
        />
      </div>

      <Panel
        title="Stock token holdings"
        right={<span className="text-[10px] text-gray-600 font-mono">{isLoading ? "reading..." : `${holdings.length}`}</span>}
      >
        {holdings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[520px]">
              <thead>
                <tr className="bg-[#14161B] border-b border-[#232730] text-[9px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 text-left font-semibold">Market</th>
                  <th className="px-3 py-2 text-right font-semibold">Shares</th>
                  <th className="px-3 py-2 text-right font-semibold">Price</th>
                  <th className="px-3 py-2 text-right font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.token.ticker} className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition">
                    <td className="px-3 py-2.5">
                      <span className="text-white font-semibold">{h.token.ticker}</span>
                      <span className="text-gray-500 text-[10px] ml-2">{h.token.name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300">{num(h.shares)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400">{h.price ? usd(h.price) : "-"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-white">{h.value ? usd(h.value) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-12 text-center text-[11px] text-gray-500">
            {isLoading ? "Reading your balances..." : "No stock tokens in this wallet yet."}
          </div>
        )}
      </Panel>

      <Footer />
    </div>
  );
}

/* ---------------- Activity ---------------- */

type Fill = { key: string; ticker: string; side: "buy" | "sell"; shares: number; weth: number; block: number };

export function ActivityView() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient({ chainId: robinhood.id });
  const [fills, setFills] = useState<Fill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!client || !address || !isConnected) return;

    (async () => {
      setLoading(true);
      try {
        const head = await client.getBlockNumber();
        const logs = await client.getLogs({
          address: MARKETS.map((m) => m.pool),
          event: SWAP_EVENT,
          args: { recipient: address },
          fromBlock: head > 40_000n ? head - 40_000n : 0n,
          toBlock: head,
        });
        const out: Fill[] = logs.map((l, i) => {
          const m = MARKETS.find((x) => x.pool.toLowerCase() === l.address.toLowerCase())!;
          const a0 = l.args.amount0 as bigint;
          const a1 = l.args.amount1 as bigint;
          const wethAmt = m.wethIsToken0 ? a0 : a1;
          const shareAmt = m.wethIsToken0 ? a1 : a0;
          const abs = (v: bigint) => (v < 0n ? -v : v);
          return {
            key: `${l.blockNumber}-${l.logIndex}-${i}`,
            ticker: m.ticker,
            side: wethAmt < 0n ? "sell" : "buy",
            shares: Number(formatUnits(abs(shareAmt), 18)),
            weth: Number(formatUnits(abs(wethAmt), 18)),
            block: Number(l.blockNumber),
          };
        });
        if (!cancelled) setFills(out.reverse());
      } catch {
        if (!cancelled) setFills([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, address, isConnected]);

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <Head title="Activity" sub="Your fills on the stock-token pools." />
        <ConnectPrompt what="Your trading activity" />
        <Footer />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Head
        title="Activity"
        sub="Your fills, decoded from pool Swap events. Swaps settle immediately, so there are no resting orders to cancel."
      />

      <Panel
        title="Recent fills"
        right={
          <span className="text-[10px] text-gray-600 font-mono">
            {loading ? "reading chain..." : `${fills.length}`}
          </span>
        }
      >
        {fills.length > 0 ? (
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto scrollbar-none">
            <table className="w-full text-[11px] min-w-[480px]">
              <thead className="sticky top-0 bg-[#14161B]">
                <tr className="border-b border-[#232730] text-[9px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 text-left font-semibold">Side</th>
                  <th className="px-3 py-2 text-left font-semibold">Market</th>
                  <th className="px-3 py-2 text-right font-semibold">Shares</th>
                  <th className="px-3 py-2 text-right font-semibold">WETH</th>
                  <th className="px-3 py-2 text-right font-semibold">Block</th>
                </tr>
              </thead>
              <tbody>
                {fills.map((f) => (
                  <tr key={f.key} className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition">
                    <td className={`px-3 py-2 font-semibold uppercase text-[10px] ${f.side === "buy" ? "text-[#10B981]" : "text-red-400"}`}>
                      {f.side}
                    </td>
                    <td className="px-3 py-2 text-white font-semibold">{f.ticker}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{num(f.shares)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-400">{num(f.weth, 5)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">{f.block}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-12 text-center text-[11px] text-gray-500">
            {loading ? "Reading your fills..." : "No fills from this wallet in the recent block window."}
          </div>
        )}
      </Panel>

      <Footer />
    </div>
  );
}

/* ---------------- Account ---------------- */

export function AccountView() {
  const { address, isConnected, connector, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: native } = useBalance({ address, chainId: robinhood.id });
  const [copied, setCopied] = useState(false);

  const wrongChain = isConnected && chainId !== robinhood.id;

  if (!isConnected || !address) {
    return (
      <div className="space-y-4">
        <Head title="Account" sub="Your wallet and network." />
        <ConnectPrompt what="Your account" />
        <Footer />
      </div>
    );
  }

  const rows: [string, React.ReactNode][] = [
    ["Address", <span key="a" className="font-mono">{short(address)}</span>],
    ["Wallet", connector?.name ?? "Injected"],
    [
      "Network",
      wrongChain ? (
        <span key="n" className="text-amber-400">
          Chain {chainId} - switch to Robinhood Chain
        </span>
      ) : (
        "Robinhood Chain · 4663"
      ),
    ],
    ["Balance", <span key="b" className="font-mono">{native ? `${num(Number(formatUnits(native.value, native.decimals)))} ${native.symbol}` : "-"}</span>],
  ];

  return (
    <div className="space-y-4">
      <Head title="Account" sub="Your wallet and network." />

      <Panel
        title="Connected wallet"
        right={
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard unavailable */
                }
              }}
              className="flex items-center gap-1 bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[10px] px-2 py-1 rounded-md transition"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={`https://robinhoodchain.blockscout.com/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[10px] px-2 py-1 rounded-md transition"
            >
              <ExternalLink size={10} />
              Explorer
            </a>
          </div>
        }
      >
        <div className="p-4 space-y-0">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-3 border-b border-[#1F2228] last:border-0">
              <span className="text-[11px] text-gray-500">{k}</span>
              <span className="text-[11px] text-white">{v}</span>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={() => disconnect()}
            className="flex items-center gap-1.5 bg-[#14161B] hover:bg-[#232730] border border-[#232730] text-gray-300 hover:text-white text-[11px] font-semibold px-4 py-2 rounded-lg transition"
          >
            <LogOut size={12} />
            Disconnect
          </button>
        </div>
      </Panel>

      <Footer />
    </div>
  );
}

/* ---------------- Settings ---------------- */

export function SettingsView() {
  const { chainId } = useAccount();
  const [head, setHead] = useState<bigint | null>(null);
  const client = usePublicClient({ chainId: robinhood.id });

  useEffect(() => {
    let cancelled = false;
    if (!client) return;
    const read = () => client.getBlockNumber().then((b) => !cancelled && setHead(b)).catch(() => {});
    read();
    const id = setInterval(read, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client]);

  const rows: [string, React.ReactNode][] = [
    ["Network", "Robinhood Chain"],
    ["Chain ID", <span key="c" className="font-mono">4663</span>],
    ["RPC endpoint", <span key="r" className="font-mono text-[10px]">rpc.mainnet.chain.robinhood.com</span>],
    [
      "Chain head",
      head ? (
        <span key="h" className="font-mono text-[#10B981]">
          {head.toString()}
        </span>
      ) : (
        <span key="h" className="flex items-center gap-1.5 text-gray-500">
          <Loader2 size={11} className="animate-spin" /> connecting
        </span>
      ),
    ],
    ["Wallet chain", chainId ? <span key="w" className="font-mono">{chainId}</span> : "not connected"],
  ];

  return (
    <div className="space-y-4">
      <Head title="Settings" sub="Network and connection." />
      <Panel title="Network">
        <div className="p-4">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-3 border-b border-[#1F2228] last:border-0">
              <span className="text-[11px] text-gray-500">{k}</span>
              <span className="text-[11px] text-white">{v}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Footer />
    </div>
  );
}
