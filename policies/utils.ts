"use server";
import { permanentRedirect, RedirectType } from "next/navigation";
import { Policy } from "./types";
import { getApplicationConfiguration } from "../app-config/fetch";
export async function isUnauthorized({
  requiredPolicies,
  lang,
  redirect = true,
  grantedPolicies: initalGrantedPolicies,
}: {
  requiredPolicies: Policy[];
  lang: string;
  redirect?: boolean;
  grantedPolicies?: Record<string, boolean> | null;
}) {
  const grantedPolicies =
    initalGrantedPolicies ?? (await getApplicationConfiguration()).policies;
  const missingPolicies = requiredPolicies.filter(
    (policy) => !grantedPolicies?.[policy]
  );
  if (missingPolicies.length > 0) {
    if (!redirect) {
      return true;
    }
    return permanentRedirect(`/${lang}/unauthorized`, RedirectType.replace);
  }
  return false;
}
