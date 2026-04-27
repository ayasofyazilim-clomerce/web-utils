import Credentials from "next-auth/providers/credentials";
export type Awaitable<T> = T | PromiseLike<T>;

import { AdapterUser } from "@auth/core/adapters";
import NextAuth, { AuthError, NextAuthResult } from "next-auth";
import {
  fetchNewAccessTokenByRefreshToken,
  fetchToken,
  getUserData,
} from "./auth-actions";
import { MyUser } from "./auth-types";

// Server-side in-memory token cache.
// Used as a performance optimization to avoid calling the token endpoint on every
// auth() / middleware invocation. Falls back to the refresh_token stored in the
// JWT cookie when the cache misses (e.g. after server restart or across runtimes).
interface TokenCacheEntry {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
  lastAccessedAt: number;
}

// Persist caches on globalThis so they survive Next.js HMR re-evaluations in dev.
// Without this, every code change wipes the in-memory tokens and forces re-login.
const globalForAuth = globalThis as typeof globalThis & {
  __tokenCache?: Map<string, TokenCacheEntry>;
  __inflightRefresh?: Map<string, Promise<TokenCacheEntry | null>>;
};
const tokenCache =
  globalForAuth.__tokenCache ??
  (globalForAuth.__tokenCache = new Map<string, TokenCacheEntry>());

// In-flight refresh promises keyed by sub.
// Prevents thundering-herd: concurrent requests for the same user share one refresh call.
const inflightRefresh =
  globalForAuth.__inflightRefresh ??
  (globalForAuth.__inflightRefresh = new Map<
    string,
    Promise<TokenCacheEntry | null>
  >());

// Refresh 60 seconds before actual expiry to avoid using a stale token.
const TOKEN_REFRESH_BUFFER_MS = 60_000;

// Maximum number of cached users. Oldest-accessed entries are evicted first.
const MAX_CACHE_SIZE = 10000;

/** Store tokens in the cache after sign-in or affiliation switch. */
export function setTokenCache(
  sub: string,
  refresh_token: string,
  access_token: string,
  expiresAt: number
) {
  tokenCache.set(sub, {
    access_token,
    refresh_token,
    expiresAt,
    lastAccessedAt: Date.now(),
  });
  evictIfNeeded();
}

export function deleteTokenCache(sub: string) {
  tokenCache.delete(sub);
  inflightRefresh.delete(sub);
}

/** Evict least-recently-accessed entries when the cache exceeds the size limit. */
function evictIfNeeded() {
  if (tokenCache.size <= MAX_CACHE_SIZE) return;
  // Also purge entries that expired more than 5 minutes ago (lazy cleanup).
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt + 5 * 60_000 < now) {
      tokenCache.delete(key);
    }
  }
  // If still over limit, drop the oldest-accessed entries.
  if (tokenCache.size > MAX_CACHE_SIZE) {
    const sorted = [...tokenCache.entries()].sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
    );
    const toRemove = sorted.slice(0, tokenCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      tokenCache.delete(key);
    }
  }
}

/**
 * Retrieve a valid access_token from the server-side cache.
 * Tokens never live in the JWT cookie — only in this in-memory Map.
 * On cache miss (server restart), returns null and the user must re-login.
 */
async function resolveAccessToken(sub: string | undefined) {
  if (!sub) {
    //console.log("[auth] resolveAccessToken: no sub provided");
    return null;
  }

  const cached = tokenCache.get(sub);
  //console.log(`[auth] resolveAccessToken: sub=${sub}, cacheHit=${!!cached}, cacheSize=${tokenCache.size}`);
  if (!cached?.refresh_token) return null;

  // Cache hit — still valid
  if (cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    cached.lastAccessedAt = Date.now();
    return cached;
  }

  // Expired — refresh it, but deduplicate concurrent calls for the same user.
  const inflight = inflightRefresh.get(sub);
  if (inflight) return inflight;

  const refreshPromise = (async (): Promise<TokenCacheEntry | null> => {
    try {
      const result = await fetchNewAccessTokenByRefreshToken(
        cached.refresh_token
      );
      if (!result.access_token) return null;

      const expiresAt = result.expires_in * 1000 + Date.now();
      const entry: TokenCacheEntry = {
        access_token: result.access_token,
        refresh_token: result.refresh_token || cached.refresh_token,
        expiresAt,
        lastAccessedAt: Date.now(),
      };
      tokenCache.set(sub, entry);
      return entry;
    } catch (err) {
      //console.error(`[auth] refresh failed for sub=${sub}`, err);
      return null;
    } finally {
      inflightRefresh.delete(sub);
    }
  })();

  inflightRefresh.set(sub, refreshPromise);
  return refreshPromise;
}

const result = NextAuth({
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: { username: {}, password: {}, tenantId: {} },
      authorize: async (credentials) => {
        function authorizeError(message: string) {
          return Promise.reject(new AuthError(JSON.stringify(message)));
        }
        try {
          const signInResponse = await fetchToken({
            username: credentials?.username as string,
            password: credentials.password as string,
            tenantId: credentials.tenantId as string,
          });
          if (
            signInResponse.error_description ||
            (signInResponse.error && signInResponse.error.message)
          ) {
            return authorizeError(
              signInResponse?.error?.message ||
                signInResponse.error_description ||
                ""
            );
          }
          const { access_token, refresh_token, expires_in } = signInResponse;
          const expiration_date = expires_in * 1000 + Date.now();

          const user_data = await getUserData(
            access_token,
            refresh_token,
            expiration_date
          );
          // Cache tokens server-side so they don't need to live in the cookie
          if (user_data.sub) {
            setTokenCache(
              user_data.sub,
              refresh_token,
              access_token,
              expiration_date
            );
            //console.log(`[auth] authorize: cached tokens for sub=${user_data.sub}, cacheSize=${tokenCache.size}`);
          }
          return user_data;
        } catch (error) {
          return authorizeError(JSON.stringify(error));
        }
      },
    }),
    Credentials({
      id: "ssr-token",
      name: "SSR Token",
      credentials: { accessToken: {}, expiresIn: {} },
      authorize: async (credentials) => {
        function authorizeError(message: string) {
          return Promise.reject(new AuthError(JSON.stringify(message)));
        }
        try {
          if (!credentials?.accessToken || !credentials?.expiresIn) {
            return authorizeError("Missing SSR token credentials");
          }

          const expirationDate =
            Number(credentials.expiresIn) * 1000 + Date.now();

          const user_data = await getUserData(
            credentials.accessToken as string,
            "", // SSR login doesn't provide refresh token
            expirationDate
          );
          // Cache the access token server-side (no refresh token for SSR)
          if (user_data.sub) {
            setTokenCache(
              user_data.sub,
              "",
              credentials.accessToken as string,
              expirationDate
            );
          }
          return user_data;
        } catch (error) {
          return authorizeError(JSON.stringify(error));
        }
      },
    }),
  ],
  pages: {
    signIn: process.env.LOGIN_ROUTE?.startsWith("/")
      ? process.env.LOGIN_ROUTE
      : `/${process.env.LOGIN_ROUTE || "login"}`,
    signOut: process.env.LOGIN_ROUTE?.startsWith("/")
      ? process.env.LOGIN_ROUTE
      : `/${process.env.LOGIN_ROUTE || "login"}`,
  },
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ user }) {
      if (user.userName) {
        return true;
      }
      return false;
    },
    async session({ session, token }) {
      if (token?.user) {
        const tokenUser = token.user as AdapterUser & MyUser;
        const sessionUser = { ...tokenUser } as AdapterUser & MyUser;

        // Tokens live only in the server-side cache, not in the cookie.
        const cached = await resolveAccessToken(tokenUser.sub);
        if (cached) {
          sessionUser.access_token = cached.access_token;
          sessionUser.refresh_token = cached.refresh_token;
        }

        session.user = sessionUser;
      }
      return session;
    },
    authorized: async ({ auth }) => {
      // We handle authorization logic in the middleware function itself
      // to support specialized path-based logic ((auth), (public), (main) groups).
      return true;
    },
    async jwt({ token, trigger, session, user }) {
      if (user) {
        token.user = user;
      }
      if (trigger === "update") {
        if (session.info) {
          token.user = { ...(token.user as object), ...session.info };
        }
      }
      // Strip ALL tokens from the cookie — they live in the server-side cache only.
      // This reduces the cookie from ~9KB to ~1-2KB, preventing HTTP 431 errors.
      if (token.user) {
        const u = token.user as Record<string, unknown>;
        delete u.access_token;
        delete u.refresh_token;
        delete u.expiration_date;
      }
      return token;
    },
  },
});

export const handlers: NextAuthResult["handlers"] = result.handlers;
export const auth: NextAuthResult["auth"] = result.auth;
export const signIn: NextAuthResult["signIn"] = result.signIn;
export const signOut: NextAuthResult["signOut"] = result.signOut;
