/**
 * Shared decoding for the public-tag slug used by the `/tag/[slug]` route.
 *
 * The slug carries a `{n:...,i:...,t:...,s:...}` key:value map where `t`
 * (travellerDocumentNumber) and `s` (stickerLineNumber) may be empty. It is
 * base64url-encoded for the URL, so it is decoded first, then the braces are
 * stripped, split on commas, and each pair split on its first colon.
 *
 * This is reversible (base64), NOT a one-way hash - despite "SHA256" wording
 * that has appeared in callers; a hash could not be decoded back to fields.
 *
 * Built on the `atob`/`TextDecoder` web globals (available in Node 18+, the
 * browser, and the Edge runtime), so it is safe to call from server components,
 * client components, and middleware/route handlers alike.
 */

export interface TagSlugData {
  tagNumber: string;
  tagId: string;
  travellerDocumentNumber: string;
  stickerLineNumber: string;
}

// Maps the short keys carried in the slug payload to the fields callers use.
const SLUG_KEY_MAP = {
  n: "tagNumber",
  i: "tagId",
  t: "travellerDocumentNumber",
  s: "stickerLineNumber",
} as const;

/**
 * Decodes a public-tag slug into its fields. Returns all-empty fields when the
 * slug cannot be decoded/parsed, so callers can fall back safely (e.g. to a
 * search form) without their own try/catch.
 */
export function decodeTagSlug(slug: string): TagSlugData {
  const result: TagSlugData = {
    tagNumber: "",
    tagId: "",
    travellerDocumentNumber: "",
    stickerLineNumber: "",
  };

  const payload = decodeSlugPayload(slug);
  if (!payload) return result;

  // Drop the surrounding braces, then parse the `key:value` pairs.
  const body = payload.trim().replace(/^\{/, "").replace(/\}$/, "");
  for (const pair of body.split(",")) {
    const colon = pair.indexOf(":");
    if (colon === -1) continue;
    const key = pair.slice(0, colon).trim();
    const value = pair.slice(colon + 1).trim();
    const field = SLUG_KEY_MAP[key as keyof typeof SLUG_KEY_MAP];
    if (field) result[field] = value;
  }

  return result;
}

/**
 * Decodes a scanned tag QR/barcode into its fields. The scanned value is
 * usually the public-tag URL (`…/tag/<slug>`), but a bare slug is accepted too
 * - the `<slug>` segment is extracted before decoding. Use this for camera /
 * wedge scanners; use {@link decodeTagSlug} when you already hold a bare slug
 * (e.g. a route param).
 */
export function decodeTagScan(scanned: string): TagSlugData {
  return decodeTagSlug(slugFromScan(scanned));
}

/**
 * Extracts the `<slug>` from a scanned value: the segment after `/tag/` in a
 * public-tag URL, or the trimmed value itself when it is already a bare slug,
 * with any trailing path / query / hash removed.
 */
function slugFromScan(scanned: string): string {
  const trimmed = scanned.trim();
  const afterTag = trimmed.split("/tag/")[1] ?? trimmed;
  return afterTag.split(/[/?#]/)[0] ?? "";
}

/**
 * Returns the decoded `{...}` payload, or "" when the slug is not usable. Tries
 * base64(url) first and falls back to treating the slug as an already-decoded
 * raw payload.
 */
function decodeSlugPayload(slug: string): string {
  // A well-formed slug is base64url (`[A-Za-z0-9-_]`) and never contains `%`.
  // If percent-encoding survived - e.g. a standard-base64 `=` padding arriving
  // as `%3D` - peel it back first. Otherwise a lenient base64 decoder drops the
  // `%` and reads the leftover hex (`3D`) as data, corrupting the tail
  // (e.g. `...A25T21041}` decodes to `...A25T21041}7`). The cap guards against
  // pathological input that never stops changing.
  let normalized = slug;
  for (let i = 0; i < 3 && normalized.includes("%"); i++) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      // Malformed percent-encoding - fall through with what we have.
      break;
    }
  }

  // Normalize base64url to standard base64, then decode. base64ToUtf8 returns
  // "" for non-base64 input (e.g. a raw `{...}` slug, which fails to decode), so
  // only trust output that still looks like the `key:value` payload.
  const b64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = base64ToUtf8(b64);
  if (decoded.includes(":")) return decoded;

  return normalized.includes(":") ? normalized : "";
}

/**
 * Isomorphic base64 → UTF-8 decode via the `atob`/`TextDecoder` web globals.
 * Unlike a lenient `Buffer.from(..., "base64")`, `atob` throws on invalid input
 * - which is caught here and surfaced as "" so a non-base64 (e.g. raw `{...}`)
 * slug falls through to the raw-payload path in the caller.
 */
function base64ToUtf8(b64: string): string {
  try {
    // Restore padding (base64url drops it; atob may require it).
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}
