export interface Localization {
  locale: string;
  timeZone: string;
  lang: string;
}

const countryToLocale = {
  GB: "en-GB",
  US: "en-US",
  IE: "en-IE",
  TR: "tr-TR",
  DE: "de-DE",
};

/**
 * Preserved verbatim from the former `TenantProvider`, `"en-UK"` fallback
 * included. That is not a valid BCP 47 tag, but it is what shipped and every
 * consumer has been reading it — changing it is a separate decision.
 */
export function getLocaleFromCountryCode(code2: string) {
  const upperCode = code2.toUpperCase();
  return upperCode in countryToLocale
    ? countryToLocale[upperCode as keyof typeof countryToLocale]
    : "en-UK";
}
