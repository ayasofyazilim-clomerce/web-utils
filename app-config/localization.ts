import type {
  ApplicationConfiguration,
  ApplicationConfigurationLanguage,
} from "./types";

export interface Localization {
  /**
   * For money and numbers: the tenant's country, whatever language the reader
   * picked, so a printed tag formats its amounts the same for every clerk.
   */
  locale: string;
  /** For dates: the reader's language, with the tenant's conventions for it. */
  dateLocale: string;
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
 * For an English reader with no regional signal, and for an unmapped
 * country's numbers. It is what the retired `"en-UK"` fallback already
 * resolved to in ICU, so nothing moved when that invalid tag went.
 */
export const FALLBACK_FORMATTING_LOCALE = "en-GB";

/** The transition map, for tenants that have not registered regional cultures yet. */
export function getLocaleFromCountryCode(code2: string): string | null {
  const upperCode = code2.toUpperCase();
  return upperCode in countryToLocale
    ? countryToLocale[upperCode as keyof typeof countryToLocale]
    : null;
}

// Every parse below throws RangeError on a malformed tag. This runs on every
// page, so a bad value degrades to the next fallback instead.

export function primaryLanguageOf(tag: string | null | undefined): string | null {
  if (!tag?.trim()) return null;
  try {
    return new Intl.Locale(tag.trim()).language;
  } catch {
    return null;
  }
}

/** A bare language ("en") says nothing about date order or clock, so it counts as unset. */
function regionalCulture(tag: string | null | undefined): string | null {
  if (!tag?.trim()) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(tag.trim());
    if (!canonical || !new Intl.Locale(canonical).region) return null;
    return Intl.DateTimeFormat.supportedLocalesOf([canonical]).length > 0
      ? canonical
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether this runtime has formatting data for the tag's region, not just its
 * language. `supportedLocalesOf` accepts "en-FO" by falling back to "en", which
 * then formats US-style; only `resolvedOptions` shows the region was dropped.
 * Node and browsers disagree on some tags ("en-JP"), so call this on the server
 * only and ship the result.
 */
export function keepsRegionalConventions(tag: string): boolean {
  const culture = regionalCulture(tag);
  if (!culture) return false;
  try {
    const resolved = new Intl.DateTimeFormat(culture).resolvedOptions().locale;
    return new Intl.Locale(resolved).region === new Intl.Locale(culture).region;
  } catch {
    return false;
  }
}

function homeLocale(language: string): string | null {
  try {
    const { region } = new Intl.Locale(language).maximize();
    return region ? regionalCulture(`${language}-${region}`) : null;
  } catch {
    return null;
  }
}

/**
 * Backs `useLocalization().dateLocale`. The language the user picked (`lang`)
 * decides the language dates are written in; the tenant only decides the
 * conventions within it, through the culture it registered for that language.
 */
export function resolveFormattingLocale({
  lang,
  languages,
  countryCode2,
}: {
  lang: string;
  languages: ApplicationConfigurationLanguage[];
  countryCode2: string | null;
}): string {
  const language = primaryLanguageOf(lang) ?? "en";
  const registered = languages
    .filter(
      (entry) =>
        primaryLanguageOf(entry.uiCultureName || entry.cultureName) ===
        language,
    )
    .map((entry) => regionalCulture(entry.cultureName))
    .find((culture) => culture !== null);
  const fromCountry = getLocaleFromCountryCode(countryCode2 ?? "");
  return (
    registered ??
    (fromCountry && primaryLanguageOf(fromCountry) === language
      ? fromCountry
      : null) ??
    (language === "en" ? FALLBACK_FORMATTING_LOCALE : homeLocale(language)) ??
    FALLBACK_FORMATTING_LOCALE
  );
}

/** Backs `useLocalization()`. */
export function resolveLocalization({
  config,
  lang,
}: {
  config: ApplicationConfiguration;
  lang: string;
}): Localization {
  return {
    locale:
      getLocaleFromCountryCode(config.country.countryCode2 ?? "") ??
      FALLBACK_FORMATTING_LOCALE,
    dateLocale: resolveFormattingLocale({
      lang,
      languages: config.languages,
      countryCode2: config.country.countryCode2,
    }),
    timeZone: config.timeZone,
    lang,
  };
}
