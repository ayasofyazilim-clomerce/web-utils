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
 * The durable reason is structural, not incidental: the only paths from
 * client code to this module go through `../api/action.ts` and
 * `../policies/utils.ts`, both marked `"use server"`, so Next replaces their
 * bodies with action references and never bundles their imports into a
 * client chunk. `app-config/index.tsx`, the barrel every client component
 * imports, re-exports only `./logic` and `./provider`, both pure. That
 * leaves exactly one unguarded door: a client component explicitly importing
 * `@repo/utils/app-config/fetch` — a narrow, greppable mistake.
 *
 * Secondarily, a client bundle would also fail on this module today since it
 * pulls in `node:path` and, via `../auth/auth`, `ioredis` — but that's
 * incidental, not the argument to lean on, since it could lapse. An explicit
 * `import "server-only"` guard isn't used instead because `../api/action.ts`
 * re-exports this module through the `@repo/utils/api` barrel, which
 * `apps/web`'s `test:unit` (`node --import tsx --test`) reaches transitively
 * from `resolve-tenant-names.test.ts`; that runner can't resolve the
 * `server-only` specifier, which only Next's bundler provides, so the guard
 * fails that gate. Revisit if the session/token-store chain ever becomes
 * isomorphic, or the barrel starts re-exporting this module directly — the
 * structural argument above would no longer hold, and this would need an
 * explicit guard plus a `test:unit` fix.
 *
 * The session's application configuration, fetched at most once per request.
 *
 * `cache()` is load-bearing, not an optimisation: most `isUnauthorized(...)`
 * call sites do not pass `grantedPolicies`, so without it each one issues its
 * own round-trip on top of the layout's.
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
