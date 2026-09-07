/**
 * Whether a tenant id denotes the host (no tenant selected).
 *
 * The backend represents "no tenant" in two ways depending on the endpoint:
 * `null` (application-configuration's `currentTenant.id`) or `Guid.Empty` —
 * the string "00000000-0000-0000-0000-000000000000" (country-settings'
 * `tenantId`). `Guid.Empty` is truthy, so a bare `!tenantId` check reports
 * every host session as a tenant, which hides host-only navigation and makes
 * host-only route guards redirect. Verified against a live host session on
 * 2026-08-28, where the payload was `tenantId:
 * "00000000-0000-0000-0000-000000000000"` with `tenantName: null`.
 *
 * Null, undefined and "" are also treated as host: the login form submits an
 * empty `__tenant` when no tenant is chosen, and `useTenant`'s `?? ""`
 * normalization defaults the field to "" when the configuration has no
 * tenant id.
 *
 * This lives in its own module, free of server imports, so the client nav,
 * the server route guard and the app-config normalizer can share one
 * predicate instead of each spelling the rule out and drifting apart.
 */
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

export function isHostTenant(tenantId: string | null | undefined): boolean {
  if (!tenantId) return true;
  return tenantId.toLowerCase() === EMPTY_GUID;
}
