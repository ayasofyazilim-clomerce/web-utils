"use client";
import { createContext, useContext } from "react";
import policies from "./policies.json";
import { Policies } from "./types";

import type { ReactNode } from "react";
const GrantedPoliciesContext = createContext<{ grantedPolicies: Policies }>({
  grantedPolicies: policies,
});

export const useGrantedPolicies = () => {
  return useContext(GrantedPoliciesContext);
};

export function GrantedPoliciesProvider({
  children,
  grantedPolicies = policies,
}: {
  children: ReactNode;
  grantedPolicies?: Policies | undefined;
}) {
  return (
    <GrantedPoliciesContext.Provider
      value={{ grantedPolicies: grantedPolicies as Policies }}
    >
      {children}
    </GrantedPoliciesContext.Provider>
  );
}
