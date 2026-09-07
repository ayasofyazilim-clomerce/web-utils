import { isHostTenant } from "./is-host-tenant";
import type {
  ApplicationConfiguration,
  CountryInfo,
  RawApplicationConfiguration,
} from "./types";

const DEFAULT_CURRENCY = "USD";
const DEFAULT_TIME_ZONE = "UTC";

export const EMPTY_APPLICATION_CONFIGURATION: ApplicationConfiguration = {
  user: {
    isAuthenticated: false,
    id: null,
    userName: null,
    name: null,
    surName: null,
    email: null,
    emailVerified: false,
    phoneNumber: null,
    roles: [],
    sessionId: null,
  },
  tenant: { id: null, name: null, isAvailable: false, isHost: true },
  country: {
    currency: DEFAULT_CURRENCY,
    countryCode2: null,
    countryCode3: null,
    countryName: null,
  },
  timeZone: DEFAULT_TIME_ZONE,
  policies: {},
  settings: {},
  features: {},
};

/**
 * Projects the raw ABP payload onto the app's contract.
 *
 * Deliberately drops `objectExtensions`, `localization.*`, `globalFeatures`,
 * `clock` and `multiTenancy`: nothing consumes them, and `objectExtensions`
 * alone is the largest block in the response.
 *
 * `country` comes from a second endpoint because application-configuration
 * exposes none of `currency`, `countryCode2`, `countryCode3` or `countryName`.
 * When the backend marks those settings visible-to-clients, read them from
 * `settings` here and the caller can stop fetching `countryInfo`.
 */
export function normalizeApplicationConfiguration(
  raw: RawApplicationConfiguration,
  countryInfo: CountryInfo | undefined,
): ApplicationConfiguration {
  const tenantId = raw.currentTenant?.id ?? countryInfo?.tenantId ?? null;

  return {
    user: {
      isAuthenticated: raw.currentUser?.isAuthenticated ?? false,
      id: raw.currentUser?.id ?? null,
      userName: raw.currentUser?.userName ?? null,
      name: raw.currentUser?.name ?? null,
      surName: raw.currentUser?.surName ?? null,
      email: raw.currentUser?.email ?? null,
      emailVerified: raw.currentUser?.emailVerified ?? false,
      phoneNumber: raw.currentUser?.phoneNumber ?? null,
      roles: raw.currentUser?.roles ?? [],
      sessionId: raw.currentUser?.sessionId ?? null,
    },
    tenant: {
      id: tenantId,
      name: raw.currentTenant?.name ?? countryInfo?.tenantName ?? null,
      isAvailable: raw.currentTenant?.isAvailable ?? false,
      isHost: isHostTenant(tenantId),
    },
    country: {
      // `||`, not `??`: an empty string from either source must still fall
      // through to the default, not reach `Intl.DateTimeFormat`/formatters
      // as `""`.
      currency: countryInfo?.currency || DEFAULT_CURRENCY,
      countryCode2: countryInfo?.countryCode2 ?? null,
      countryCode3: countryInfo?.countryCode3 ?? null,
      countryName: countryInfo?.countryName ?? null,
    },
    // The IANA zone. `setting.values["Abp.Timing.TimeZone"]` is a Windows id
    // and `Intl.DateTimeFormat` throws on it. `||`, not `??`: an empty string
    // is a real value the backend can send and must not survive to `Intl`.
    timeZone:
      raw.timing?.timeZone?.iana?.timeZoneName ||
      countryInfo?.timeZone ||
      DEFAULT_TIME_ZONE,
    policies: (raw.auth?.grantedPolicies ?? {}) as Record<string, boolean>,
    settings: raw.setting?.values ?? {},
    features: raw.features?.values ?? {},
  };
}
