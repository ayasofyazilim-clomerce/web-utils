type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The ssr-token sign-in takes its access token from the caller, and its payload
 * is only base64-decoded, never signature-checked. Ask the identity server
 * whether the token is real and belongs to `expectedSub` before trusting it.
 */
export async function verifySsrToken(
  accessToken: string,
  expectedSub: string | undefined,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  if (!expectedSub) return false;
  try {
    const response = await fetchImpl(
      `${process.env.GATEWAY_URL}/connect/userinfo`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );
    if (response.status !== 200) return false;
    const body = (await response.json()) as { sub?: unknown } | null;
    return typeof body?.sub === "string" && body.sub === expectedSub;
  } catch {
    return false;
  }
}
