type Values = Record<string, string | null>;

export function getSetting(values: Values, key: string): string | null {
  return values[key] ?? null;
}

/**
 * ABP sends every setting as a string and is not consistent about casing:
 * the same payload carries both `"True"` and `"false"`. A `=== "true"` check
 * reads roughly half the settings as false.
 */
export function getBooleanSetting(
  values: Values,
  key: string,
  fallback = false,
): boolean {
  const raw = values[key];
  if (raw === null || raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

export function getNumberSetting(
  values: Values,
  key: string,
  fallback: number,
): number {
  const raw = values[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function getFeature(values: Values, key: string): string | null {
  return values[key] ?? null;
}

export function getBooleanFeature(
  values: Values,
  key: string,
  fallback = false,
): boolean {
  return getBooleanSetting(values, key, fallback);
}
