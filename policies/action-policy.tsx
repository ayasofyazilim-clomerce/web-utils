// @ts-nocheck
"use client";

import { Policy } from "./types";

export function isActionGranted(
  requiredPolicies: Policy[],
  grantedPolicies: Policies | undefined,
) {
  const missingPolicies = requiredPolicies.filter(
    (policy) => !grantedPolicies?.[policy],
  );
  if (missingPolicies.length > 0) {
    return false;
  }
  return true;
}
