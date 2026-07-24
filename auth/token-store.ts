import Redis from "ioredis";

// Two-layer token store for the auth BFF.
//
// L1 = per-instance in-memory Map: fast, and the ONLY layer when no Redis is
//      configured (local dev) - preserving the previous behavior exactly.
// L2 = Redis: shared + persistent, the source of truth. It makes sessions
//      survive instance restarts and work across instances - an instance that
//      did not handle sign-in still finds the tokens (the fix for
//      "instance down → everyone logged out"). L1 is a read-through cache in
//      front of it.
//
// Enable by setting AUTH_REDIS_URL (your own Redis, or the backend's shared
// instance with AUTH_REDIS_PREFIX to avoid key collisions). Tokens live only in
// this store - never in the JWT cookie - so the cookie stays small (no HTTP 431).

export interface TokenCacheEntry {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
  lastAccessedAt: number;
}

// Treat an entry as "needs attention" this many ms before hard expiry, so a
// refresh started by one instance is picked up (via L2) by others instead of
// each racing to refresh. Shared with resolveAccessToken in auth.ts.
export const TOKEN_REFRESH_BUFFER_MS = 60_000;

// Persist on globalThis so caches/clients survive HMR and are shared across the
// proxy + render within one Node process.
const globalForStore = globalThis as typeof globalThis & {
  __tokenL1?: Map<string, TokenCacheEntry>;
  __tokenRedis?: Redis | null;
};
const l1 = (globalForStore.__tokenL1 ??= new Map<string, TokenCacheEntry>());

const REDIS_URL = process.env.AUTH_REDIS_URL || "";
const PREFIX = process.env.AUTH_REDIS_PREFIX ?? "urw:auth:token:";

/** Hide credentials before logging a connection string. */
function maskUrl(url: string): string {
  return url.replace(/\/\/[^@/]*@/, "//***@");
}

// One-time signal at startup so it's obvious which store is active in the logs.
// NOTE: "configured" only means the URL is set - the client connects lazily on
// the first auth request. A successful connection is confirmed separately by the
// "Redis connected" line below (or reported by "Redis error").
if (REDIS_URL) {
  console.log(
    `[auth-token-store] Redis configured (${maskUrl(REDIS_URL)}, prefix "${PREFIX}") - not connected yet; watch for "Redis connected".`
  );
} else {
  console.log(
    "[auth-token-store] AUTH_REDIS_URL not set - using in-memory store (per-instance; sessions drop on restart)."
  );
}

/** Lazily create the shared Redis client. Returns null when Redis is disabled. */
function redis(): Redis | null {
  if (!REDIS_URL) return null;
  if (globalForStore.__tokenRedis === undefined) {
    try {
      const client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        connectTimeout: 10_000,
        // Bound how long a command waits when Redis is unreachable so the hot
        // path falls back to L1 quickly instead of hanging. Offline queue stays
        // ON (default) so a command issued while still connecting - e.g. the
        // first request right after an instance restart - waits for the
        // connection instead of failing and logging the user out.
        commandTimeout: 3_000,
      });
      client.on("ready", () =>
        console.log("[auth-token-store] Redis connected")
      );
      // Never let a connection error crash the process - every caller below
      // falls back to L1 on failure. Throttle so retries don't flood logs.
      let lastErrorLog = 0;
      client.on("error", (err: Error) => {
        const now = Date.now();
        if (now - lastErrorLog > 30_000) {
          lastErrorLog = now;
          console.error(
            `[auth-token-store] Redis error: ${err?.message ?? String(err)}`
          );
        }
      });
      globalForStore.__tokenRedis = client;
    } catch (err) {
      console.error(
        `[auth-token-store] Redis init failed: ${(err as Error)?.message ?? String(err)}`
      );
      globalForStore.__tokenRedis = null;
    }
  }
  return globalForStore.__tokenRedis ?? null;
}

const key = (sub: string) => PREFIX + sub;

/**
 * Return the freshest available entry: L1 when comfortably valid, otherwise
 * Redis (warming L1). This is what lets a rotated/refreshed token written by one
 * instance reach the others before their local copy is actually used.
 */
export async function storeGet(sub: string): Promise<TokenCacheEntry | null> {
  const local = l1.get(sub);
  if (local && local.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    local.lastAccessedAt = Date.now();
    return local;
  }
  const client = redis();
  if (!client) return local ?? null;
  try {
    const raw = await client.get(key(sub));
    if (!raw) return local ?? null;
    const entry = JSON.parse(raw) as TokenCacheEntry;
    l1.set(sub, entry);
    return entry;
  } catch {
    return local ?? null;
  }
}

/** Write to L1 immediately and to Redis with a TTL matching the token lifetime. */
export async function storeSet(
  sub: string,
  entry: TokenCacheEntry
): Promise<void> {
  l1.set(sub, entry);
  const client = redis();
  if (!client) return;
  try {
    const ttlMs = Math.max(entry.expiresAt - Date.now(), 60_000);
    await client.set(key(sub), JSON.stringify(entry), "PX", Math.ceil(ttlMs));
  } catch {
    // L1 already updated; a later successful write reconciles Redis.
  }
}

export async function storeDelete(sub: string): Promise<void> {
  l1.delete(sub);
  const client = redis();
  if (!client) return;
  try {
    await client.del(key(sub));
  } catch {
    // Best-effort; the entry will expire via its TTL regardless.
  }
}

/**
 * Diagnostic: force the client to exist and PING it. Lets a health endpoint
 * report whether Redis is actually reachable WITHOUT needing a logged-in
 * session to trigger the lazy connection.
 */
export async function tokenStoreStatus(): Promise<{
  mode: "redis" | "memory";
  connected: boolean;
  status?: string;
  latencyMs?: number;
  error?: string;
}> {
  if (!REDIS_URL) return { mode: "memory", connected: false };
  const client = redis();
  if (!client) return { mode: "redis", connected: false, error: "init failed" };
  try {
    const start = Date.now();
    const pong = await client.ping();
    return {
      mode: "redis",
      connected: pong === "PONG",
      status: client.status,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      mode: "redis",
      connected: false,
      status: client.status,
      error: (e as Error)?.message ?? String(e),
    };
  }
}
