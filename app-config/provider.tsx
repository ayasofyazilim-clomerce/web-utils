"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  EMPTY_APPLICATION_CONFIGURATION,
  type ApplicationConfiguration,
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

export function ApplicationConfigurationProvider({
  configuration,
  children,
}: {
  configuration: ApplicationConfiguration;
  children: ReactNode;
}) {
  return (
    <ApplicationConfigurationContext.Provider value={configuration}>
      {children}
    </ApplicationConfigurationContext.Provider>
  );
}
