"use server";
import { getAccountServiceClient } from "../auth/auth-actions";
import { auth } from "../auth/auth";
import { Policies } from "../policies/types";
export async function getGrantedPoliciesApi() {
  try {
    const session = await auth();
    const client = await getAccountServiceClient(session?.user?.access_token);
    // We only read grantedPolicies here. Leaving the localization resources in
    // makes this a 397 KB / ~900 ms call instead of 19 KB / ~225 ms, on every
    // render of the (main) layout.
    const response =
      await client.abpApplicationConfiguration.getApiAbpApplicationConfiguration(
        { includeLocalizationResources: false }
      );
    const grantedPolicies = response.auth?.grantedPolicies;
    return grantedPolicies as Policies;
  } catch (error) {
    return undefined;
  }
}
