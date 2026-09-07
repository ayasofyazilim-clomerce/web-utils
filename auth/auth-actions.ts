"use server";

import { AccountServiceClient } from "@repo/core-saas/AccountService";
import { AdministrationServiceClient } from "@repo/core-saas/AdministrationService";
import { redirect } from "next/navigation";
import { auth, deleteTokenCache, setTokenCache, signOut } from "./auth";
import { buildUserData } from "./user-claims";

const TOKEN_URL = `${process.env.GATEWAY_URL}/connect/token`;
const OPENID_URL = `${process.env.GATEWAY_URL}/.well-known/openid-configuration`;
const HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
  "Content-Type": "application/json",
};

export async function getAccountServiceClient(accessToken?: string) {
  return new AccountServiceClient({
    TOKEN: accessToken,
    BASE: process.env.GATEWAY_URL,
    HEADERS: HEADERS,
  });
}

export async function getAdministrationServiceClient(accessToken?: string) {
  return new AdministrationServiceClient({
    TOKEN: accessToken,
    BASE: process.env.GATEWAY_URL,
    HEADERS: HEADERS,
  });
}

export async function signOutServer({
  redirectTo = "/en/login",
  redirect: shouldRedirect = true,
}: { redirectTo?: string; redirect?: boolean } = {}): Promise<{
  error: string;
}> {
  try {
    const session = await auth();
    const sub = session?.user?.sub;
    if (sub) await deleteTokenCache(sub);
    await signOut({ redirect: false });
  } catch (error) {
    return { error: "Unknown error" };
  }
  // Callers that need to clear a stale session in place (e.g. the public
  // /validate KYC step) pass redirect:false so we don't bounce to /login.
  if (shouldRedirect) redirect(redirectTo);
  // Reached only when redirect:false - always return an object (never
  // undefined) so callers typed `() => Promise<object>` stay satisfied.
  return { error: "" };
}

export async function fetchScopes() {
  const scopes = await fetch(OPENID_URL)
    .then((response) => response.json())
    .then(
      (json: { scopes_supported?: string[] }) =>
        json.scopes_supported?.join(" ") || ""
    );
  return scopes;
}
type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  error_description?: string;
  error?: {
    message?: string;
  };
};
export async function fetchToken<T extends TokenResponse>(credentials: {
  username: string;
  password: string;
  tenantId?: string;
}): Promise<T> {
  const scopes = await fetchScopes();
  const urlencoded = new URLSearchParams();
  const urlEncodedContent: Record<string, string> = {
    grant_type: "password",
    client_id: process.env.CLIENT_ID || "",
    client_secret: process.env.CLIENT_SECRET || "",
    username: credentials.username,
    password: credentials.password,
    scope: scopes,
  };

  Object.entries(urlEncodedContent).forEach(([key, value]) =>
    urlencoded.append(key, value)
  );
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      __tenant: credentials.tenantId || "",
    },
    body: urlencoded,
  });
  return await response.json();
}
export async function fetchNewAccessTokenByRefreshToken(refreshToken: string) {
  const urlencoded = new URLSearchParams();
  const urlEncodedContent: Record<string, string> = {
    client_id: process.env.CLIENT_ID || "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  Object.entries(urlEncodedContent).forEach(([key, value]) =>
    urlencoded.append(key, value)
  );
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: urlencoded,
  });

  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export async function getUserData(
  access_token: string,
  refresh_token: string,
  expiration_date: number
) {
  return buildUserData(access_token, refresh_token, expiration_date);
}

/**
 * Server action: refresh tokens after an affiliation switch.
 * Returns the new user data (claims) for the session update.
 * The heavy token refresh happens server-side, not on the client.
 */
export async function refreshSessionAfterAffiliationSwitch() {
  const session = await auth();
  const user = session?.user as Record<string, string> | undefined;
  const sub = user?.sub;
  const refreshToken = user?.refresh_token;
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  // Re-fetch new tokens since affiliation change invalidates current claims
  const result = await fetchNewAccessTokenByRefreshToken(refreshToken);
  if (!result.access_token) {
    throw new Error("Token refresh failed");
  }

  const expiresAt = result.expires_in * 1000 + Date.now();
  if (sub) {
    await setTokenCache(
      sub,
      result.refresh_token,
      result.access_token,
      expiresAt
    );
  }

  // Return user data extracted from the new access_token (for session update)
  const userData = await getUserData(
    result.access_token,
    result.refresh_token,
    expiresAt
  );
  return userData;
}
