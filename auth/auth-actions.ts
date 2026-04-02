"use server";

import { AccountServiceClient } from "@repo/core-saas/AccountService";
import { redirect } from "next/navigation";
import { auth, deleteTokenCache, setTokenCache, signOut } from "./auth";

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

export async function signOutServer({
  redirectTo = "/en/login",
}: { redirectTo?: string } = {}) {
  try {
    const session = await auth();
    const sub = session?.user?.sub;
    if (sub) deleteTokenCache(sub);
    await signOut({ redirect: false });
  } catch (error) {
    return { error: "Unknown error" };
  }
  redirect(redirectTo);
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
  const decoded_jwt = JSON.parse(
    Buffer.from(access_token.split(".")[1] || "", "base64").toString()
  );
  return {
    refresh_token,
    expiration_date,
    userName: decoded_jwt.unique_name,
    name: decoded_jwt.given_name,
    surname: decoded_jwt.family_name ?? "",
    email: decoded_jwt.email,
    sub: decoded_jwt.sub,
    role: decoded_jwt.role,
    CustomsId: decoded_jwt.CustomsId,
    MerchantId: decoded_jwt.MerchantId,
    RefundPointId: decoded_jwt.RefundPointId,
    TaxFreeId: decoded_jwt.TaxFreeId,
    TaxOfficeId: decoded_jwt.TaxOfficeId,
    TourGuideId: decoded_jwt.TourGuideId,
    TravellerId: decoded_jwt.TravellerId,
    PartyLevel: decoded_jwt.PartyLevel,
  };
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
    setTokenCache(sub, result.refresh_token, result.access_token, expiresAt);
  }

  // Return user data extracted from the new access_token (for session update)
  const userData = await getUserData(
    result.access_token,
    result.refresh_token,
    expiresAt
  );
  return userData;
}
