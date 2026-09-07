import { cache } from "react";
import {
  getAccountServiceClient,
  getAdministrationServiceClient,
} from "../auth/auth-actions";
import { auth } from "../auth/auth";
import {
  EMPTY_APPLICATION_CONFIGURATION,
  normalizeApplicationConfiguration,
  type ApplicationConfiguration,
  type CountryInfo,
} from "./logic";

/**
 * The session's application configuration, fetched at most once per request.
 *
 * `cache()` is load-bearing, not an optimisation. Of 135 `isUnauthorized(...)`
 * call sites only 8 pass `grantedPolicies`; the rest each triggered their own
 * 19 KB / ~225 ms round-trip on top of the layout's. Without the cache this is
 * ~128 calls per page render.
 *
 * The two requests are independent: `Promise.allSettled` means a country
 * lookup failure leaves policies intact, and an application-configuration
 * failure still fails closed with an empty policy map.
 */
export const getApplicationConfiguration = cache(
  async (): Promise<ApplicationConfiguration> => {
    const session = await auth();
    if (!session) return EMPTY_APPLICATION_CONFIGURATION;

    const client = await getAccountServiceClient(session.user?.access_token);

    const [configResult, countryResult] = await Promise.allSettled([
      // `includeLocalizationResources: false` keeps this at 19 KB / ~225 ms
      // instead of 397 KB / ~900 ms, on every render of the (main) layout.
      client.abpApplicationConfiguration.getApiAbpApplicationConfiguration({
        includeLocalizationResources: false,
      }),
      getCountryInfo(session.user?.access_token),
    ]);

    if (configResult.status === "rejected") {
      return EMPTY_APPLICATION_CONFIGURATION;
    }

    return normalizeApplicationConfiguration(
      configResult.value,
      countryResult.status === "fulfilled" ? countryResult.value : undefined,
    );
  },
);

async function getCountryInfo(
  accessToken: string | undefined,
): Promise<CountryInfo | undefined> {
  const client = await getAdministrationServiceClient(accessToken);
  return await client.countrySetting.getApiAdministrationServiceCountrySettingsInfo();
}
