"use client";

import {SessionProvider as Default, useSession as DefaultUseSession} from "next-auth/react";
export const SessionProvider = Default;
export function useSession() {
  const {data: session, update: sessionUpdate} = DefaultUseSession();
  return {session, sessionUpdate};
}
