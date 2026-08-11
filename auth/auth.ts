import Credentials from "next-auth/providers/credentials";
export type Awaitable<T> = T | PromiseLike<T>;

import { AdapterUser } from "@auth/core/adapters";
import NextAuth, { AuthError, NextAuthResult } from "next-auth";
import { basename } from "node:path";
import {
  fetchNewAccessTokenByRefreshToken,
  fetchToken,
  getUserData,
} from "./auth-actions";
import { MyUser } from "./auth-types";
import {
  storeDelete,
  storeGet,
  storeSet,
  TOKEN_REFRESH_BUFFER_MS,
  type TokenCacheEntry,
} from "./token-store";

// Server-side token store. Tokens NEVER live in the JWT cookie (that grows with
// ABP claims and caused HTTP 431) - they live in token-store.ts: a per-instance
// in-memory L1 in front of a shared, persistent Redis L2 (enabled via
// AUTH_REDIS_URL). L2 is what makes a session survive an instance restart and
// work across instances; without it we fall back to L1 only (previous behavior).

// In-flight refresh promises keyed by sub. Per-instance dedup only - prevents a
// thundering herd of refresh calls for the same user on one instance.
const globalForAuth = globalThis as typeof globalThis & {
  __inflightRefresh?: Map<string, Promise<TokenCacheEntry | null>>;
};
const inflightRefresh =
  globalForAuth.__inflightRefresh ??
  (globalForAuth.__inflightRefresh = new Map<
    string,
    Promise<TokenCacheEntry | null>
  >());

/** Store tokens after sign-in or affiliation switch. */
export async function setTokenCache(
  sub: string,
  refresh_token: string,
  access_token: string,
  expiresAt: number
) {
  await storeSet(sub, {
    access_token,
    refresh_token,
    expiresAt,
    lastAccessedAt: Date.now(),
  });
}

export async function deleteTokenCache(sub: string) {
  inflightRefresh.delete(sub);
  await storeDelete(sub);
}

/**
 * Retrieve a valid access_token from the server-side store (L1 → Redis L2).
 * On a miss (no store entry, or Redis unreachable and nothing local) returns
 * null and the user must re-login.
 */
async function resolveAccessToken(sub: string | undefined) {
  if (!sub) return null;

  const cached = await storeGet(sub);
  if (!cached) return null;

  // SSR-token login: no refresh_token (empty string). Use it while still valid.
  if (!cached.refresh_token) {
    if (cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
      return cached;
    }
    return null;
  }

  // Still valid - use it. (storeGet already preferred a fresher L2 copy if one
  // exists, e.g. after another instance refreshed.)
  if (cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return cached;
  }

  // Expired - refresh it, deduplicating concurrent calls for the same user
  // (per instance). The result is written to the shared store for all instances.
  const inflight = inflightRefresh.get(sub);
  if (inflight) return inflight;

  const refreshPromise = (async (): Promise<TokenCacheEntry | null> => {
    try {
      const result = await fetchNewAccessTokenByRefreshToken(
        cached.refresh_token
      );
      if (!result.access_token) return null;

      const entry: TokenCacheEntry = {
        access_token: result.access_token,
        refresh_token: result.refresh_token || cached.refresh_token,
        expiresAt: result.expires_in * 1000 + Date.now(),
        lastAccessedAt: Date.now(),
      };
      await storeSet(sub, entry);
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

// Next runs each app from its own directory, so this is "ssr" or "web". Both apps
// share this config and the same localhost host in dev, and cookies ignore ports -
// without distinct names a login in one shows up as a login in the other.
const APP_COOKIE_PREFIX = basename(process.cwd());

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
            await setTokenCache(
              user_data.sub,
              refresh_token,
              access_token,
              expiration_date
            );
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
            await setTokenCache(
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
  cookies: {
    sessionToken: { name: `${APP_COOKIE_PREFIX}.authjs.session-token` },
    callbackUrl: { name: `${APP_COOKIE_PREFIX}.authjs.callback-url` },
    csrfToken: { name: `${APP_COOKIE_PREFIX}.authjs.csrf-token` },
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
      // Strip ALL tokens from the cookie - they live in the server-side cache only.
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
export { tokenStoreStatus } from "./token-store";
