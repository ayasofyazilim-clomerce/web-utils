"use client";

import { formatToLocalizedDate } from "@repo/ayasofyazilim-ui/custom/date-tooltip";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  EMPTY_APPLICATION_CONFIGURATION,
  getLocaleFromCountryCode,
  type ApplicationConfiguration,
  type Localization,
} from "./logic";

const ApplicationConfigurationContext = createContext<ApplicationConfiguration>(
  EMPTY_APPLICATION_CONFIGURATION,
);

/**
 * Defaults to the fail-closed empty configuration rather than throwing, so a
 * component rendered outside the provider hides permission-gated UI instead of
 * crashing the tree.
 */
export const useApplicationConfiguration = () =>
  useContext(ApplicationConfigurationContext);

/**
 * Carries only the route's `lang`; everything else comes from the
 * configuration.
 */
const LangContext = createContext<string>("en");

export function ApplicationConfigurationProvider({
  configuration,
  lang,
  children,
}: {
  configuration: ApplicationConfiguration;
  lang: string;
  children: ReactNode;
}) {
  useEffect(() => {
    localStorage.setItem(
      "countryCode2",
      configuration.country.countryCode2?.toLocaleLowerCase() || "us",
    );
    localStorage.setItem("tenantTimeZone", configuration.timeZone);
  }, [configuration.country.countryCode2, configuration.timeZone]);

  return (
    <ApplicationConfigurationContext.Provider value={configuration}>
      <LangContext.Provider value={lang}>{children}</LangContext.Provider>
    </ApplicationConfigurationContext.Provider>
  );
}

/**
 * What 109 of the 121 former `useTenant` consumers actually wanted.
 * `lang` is a route segment, not configuration, which is why it rides a
 * separate context rather than being folded into the contract.
 */
export function useLocalization(): Localization {
  const config = useContext(ApplicationConfigurationContext);
  const lang = useContext(LangContext);
  return useMemo(
    () => ({
      locale: getLocaleFromCountryCode(config.country.countryCode2 || "UK"),
      timeZone: config.timeZone,
      lang,
    }),
    [config.country.countryCode2, config.timeZone, lang],
  );
}

/**
 * Flat tenant accessors. Centralizes the `?? ""` null-to-empty-string
 * normalization `useTenant` used to apply, so it lives in one place instead
 * of being repeated at every call site.
 *
 * No `timeZone`: nothing needed it here. Read the tenant's zone from
 * `useLocalization().timeZone`.
 */
export function useTenantInfo() {
  const { tenant } = useApplicationConfiguration();
  return useMemo(
    () => ({
      tenantId: tenant.id ?? "",
      tenantName: tenant.name ?? "",
      isHost: tenant.isHost,
      isAvailable: tenant.isAvailable,
    }),
    [tenant],
  );
}

/**
 * Flat country accessors. `currency` deliberately has no `?? ""` — the
 * contract types it as a non-nullable string with a default.
 */
export function useCountryInfo() {
  const { country } = useApplicationConfiguration();
  return useMemo(
    () => ({
      currency: country.currency,
      countryCode2: country.countryCode2 ?? "",
      countryCode3: country.countryCode3 ?? "",
      countryName: country.countryName ?? "",
    }),
    [country],
  );
}

/**
 * Thin wrapper over `formatToLocalizedDate` closing over `localization`.
 * `formatToTenantDate` pins the tenant's own time zone.
 */
export function useTenantDateFormatters() {
  const localization = useLocalization();
  return useMemo(
    () => ({
      formatToTenantDate: (
        date: string | Date,
        dateOptions?: Intl.DateTimeFormatOptions,
      ) =>
        formatToLocalizedDate({
          date,
          dateOptions,
          localization,
          timeZone: localization.timeZone,
        }),
    }),
    [localization],
  );
}
