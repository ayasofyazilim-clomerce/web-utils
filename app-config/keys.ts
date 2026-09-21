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
 * clients one at a time via ABP's `IsVisibleToClients`. As of 2026-09-21 the
 * `CountryManagement.*` keys in the payload are `EarlyRefundAvailable`,
 * `MinimumSalesAmount` and the latter's `.PerVAT` / `.PerFactura` modifiers.
 */
export const SETTING_KEYS = {
  earlyRefundAvailable: "CountryManagement.EarlyRefund.EarlyRefundAvailable",
  /**
   * Smallest invoice total that may be issued as a tag, in the tenant
   * currency. Read with `getNumberSetting` — ABP sends it as a string ("300").
   *
   * `.PerVAT` and `.PerFactura` ride alongside it and change what the amount
   * is measured against (per VAT rate, per invoice). Both are absent here
   * deliberately: no consumer branches on them, so the amount is compared
   * against the tag total and a tenant that switches either on is enforced
   * server-side only.
   */
  minimumSalesAmount:
    "CountryManagement.IssuingFieldManagement.MinimumSalesAmount",
} as const;

export const FEATURE_KEYS = {
  /** A string enum ("Optional"), not a boolean — read with `getFeature`. */
  twoFactor: "Identity.TwoFactor",
} as const;
