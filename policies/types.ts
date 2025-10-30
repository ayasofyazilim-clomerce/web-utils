// @ts-nocheck
import type policies from "./policies.json";

export type Policy = keyof typeof policies;
export type Policies = Record<Policy, boolean>