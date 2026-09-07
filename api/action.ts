"use server";
import { getApplicationConfiguration } from "../app-config/fetch";

/**
 * Kept for its ~130 existing callers. Reads the request-cached application
 * configuration rather than issuing its own round-trip.
 *
 * Prefer `useApplicationConfiguration()` in client code and
 * `getApplicationConfiguration()` on the server for anything new.
 */
export async function getGrantedPoliciesApi() {
  const config = await getApplicationConfiguration();
  return config.policies;
}
