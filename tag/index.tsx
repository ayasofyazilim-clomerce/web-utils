/**
 * The Unirefund tag-QR format, re-exported from `@unirefund/qr`.
 *
 * That package is the single definition of how these codes are written and read,
 * shared with both mobile apps so a code produced by one resolves identically in
 * all of them. It has zero dependencies and runs on Node, browsers and the Edge
 * runtime, so it is safe to call from server components, client components and
 * middleware alike — the same guarantee the local implementation gave.
 *
 * Kept as a re-export rather than asking every caller to change its import, so
 * `@repo/utils/tag` keeps working everywhere it is already used. It also now
 * carries the encoder and the airport validate-URL helpers, which the local
 * implementation never had.
 *
 * Read the package's README before changing the format. Its golden fixtures fail
 * in every consuming app at once if you do, which is the point.
 */

export * from "@unirefund/qr";
