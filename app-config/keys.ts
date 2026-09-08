/**
 * Setting keys, as named constants so a typo fails `keys.test.ts` rather than
 * resolving to `undefined` and reading as `false`.
 *
 * `Abp.Timing.TimeZone` is deliberately absent. Its value is a Windows zone id
 * ("GMT Standard Time") which `Intl.DateTimeFormat` rejects; the IANA zone
 * comes from `timing.timeZone.iana.timeZoneName` and lands on
 * `ApplicationConfiguration.timeZone`.
 *
 * Only keys with a live consumer belong here. The backend exposes settings to
 * clients one at a time via ABP's `IsVisibleToClients`, and as of 2026-09-04
 * `EarlyRefundAvailable` is the only `CountryManagement.*` key in the payload.
 */
export const SETTING_KEYS = {
  earlyRefundAvailable: "CountryManagement.EarlyRefund.EarlyRefundAvailable",
} as const;

export const FEATURE_KEYS = {
  /** A string enum ("Optional"), not a boolean — read with `getFeature`. */
  twoFactor: "Identity.TwoFactor",
} as const;
