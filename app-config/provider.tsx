"use client";

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
 * What 109 of the 122 former `useTenant` consumers actually wanted.
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
