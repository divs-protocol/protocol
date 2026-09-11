import { NextResponse } from "next/server";
import { robinhood } from "viem/chains";

/**
 * JSON-RPC proxy for Robinhood Chain.
 *
 * The public endpoint answers browser requests with `Access-Control-Allow-Origin`
 * sent twice, which every browser rejects ("contains multiple values '*,*'"), so
 * reads made straight from the page fail and the UI renders empty. Calls made
 * from a server are not subject to CORS at all, so the browser talks to this
 * route and the route talks to the chain.
 *
 * It forwards reads only. Transactions are signed and broadcast by the user's
 * wallet over its own connection, so nothing here needs to write, and a relay
 * that cannot write is not worth pointing at anything else.
 */

const RPC_URL =
  process.env.ROBINHOOD_RPC_URL ??
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ??
  robinhood.rpcUrls.default.http[0];

const ALLOWED = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "net_version",
  "web3_clientVersion",
]);

/**
 * The endpoint rate-limits, and a page that reads seventeen markets trips it on
 * load. Requests queue here so only a few are ever in flight, and a 429 is
 * retried with a widening delay rather than handed back to the browser as an
 * empty price.
 */
const MAX_IN_FLIGHT = 3;
const ATTEMPT_DELAYS_MS = [250, 700, 1600];

let inFlight = 0;
const waiting: (() => void)[] = [];

async function acquire() {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight += 1;
}

function release() {
  inFlight -= 1;
  waiting.shift()?.();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function forward(body: unknown): Promise<Response> {
  await acquire();
  try {
    for (let attempt = 0; ; attempt += 1) {
      const upstream = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      if (upstream.status !== 429 || attempt >= ATTEMPT_DELAYS_MS.length) return upstream;

      // Honour Retry-After when the endpoint sends one, otherwise back off.
      const retryAfter = Number(upstream.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 5000)
          : ATTEMPT_DELAYS_MS[attempt],
      );
    }
  } finally {
    release();
  }
}

type RpcCall = { id?: unknown; method?: unknown };

/** JSON-RPC "method not found", so viem surfaces it as a normal RPC error. */
const refused = (call: RpcCall) => ({
  jsonrpc: "2.0",
  id: call?.id ?? null,
  error: { code: -32601, message: `Method not proxied: ${String(call?.method)}` },
});

export async function POST(request: Request) {
  let body: RpcCall | RpcCall[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  // A batch is legal JSON-RPC and viem sends one when batching is on.
  const calls = Array.isArray(body) ? body : [body];
  const blocked = calls.find((call) => typeof call?.method !== "string" || !ALLOWED.has(call.method));
  if (blocked) {
    return NextResponse.json(Array.isArray(body) ? [refused(blocked)] : refused(blocked));
  }

  try {
    const upstream = await forward(body);
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: Array.isArray(body) ? null : (body?.id ?? null),
        error: { code: -32603, message: error instanceof Error ? error.message : "Upstream failed" },
      },
      { status: 502 },
    );
  }
}
