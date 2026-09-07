"use client";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { Policies } from "./types";

import type { ReactNode } from "react";

/**
 * Adapter over `useApplicationConfiguration`, kept for its 145 importers.
 */
export const useGrantedPolicies = () => {
  const config = useApplicationConfiguration();
  return { grantedPolicies: config.policies as Policies };
};

/**
 * Retained so existing mounting sites compile. The configuration provider is
 * the source now, so this only renders its children.
 */
export function GrantedPoliciesProvider({
  children,
}: {
  children: ReactNode;
  /** @deprecated Ignored; the configuration provider is the source. */
  grantedPolicies?: Policies | undefined;
}) {
  return <>{children}</>;
}
