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
 * Server-only: never import this from a client component.
 *
 * Deliberately no `import "server-only"` guard here, unlike
 * `apps/web/src/language-data/get-translations.ts` and its ssr counterpart.
 * `../api/action.ts` imports this module and re-exports it through the
 * `@repo/utils/api` barrel, which `apps/web`'s `test:unit`
 * (`node --import tsx --test`) reaches transitively from
 * `resolve-tenant-names.test.ts`; that runner can't resolve the
 * `server-only` specifier, which only Next's bundler provides, so the guard
 * fails that gate. The boundary holds anyway: a client bundle already fails
 * on this module, since it pulls in `node:path` and, via `../auth/auth`,
 * `ioredis`. Revisit if the session/token-store chain ever becomes
 * isomorphic — that incidental protection would lapse, and this would need
 * an explicit guard plus a `test:unit` fix.
 *
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
 *
 * The outer try/catch is a second, blanket fail-closed guard: `auth()` and
 * client construction sit outside the `Promise.allSettled`, so a failure
 * there (e.g. session-cookie decryption) would otherwise reject the
 * `cache()`-memoized promise instead of resolving to the empty config, and
 * neither `getGrantedPoliciesApi()` nor `isUnauthorized` catches.
 */
export const getApplicationConfiguration = cache(
  async (): Promise<ApplicationConfiguration> => {
    try {
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
    } catch {
      return EMPTY_APPLICATION_CONFIGURATION;
    }
  },
);

async function getCountryInfo(
  accessToken: string | undefined,
): Promise<CountryInfo | undefined> {
  const client = await getAdministrationServiceClient(accessToken);
  return await client.countrySetting.getApiAdministrationServiceCountrySettingsInfo();
}
