import { ApiError } from "@repo/core-saas/AccountService";

export interface BaseServerResponse {
  message: string;
}

export interface SuccessServerResponse<T> {
  type: "success";
  data: T;
  message: string;
}
export interface ApiErrorServerResponse {
  type: "api-error";
  data: ApiError["message"];
  message: string;
  // HTTP status code of the underlying ApiError, when known. Lets callers
  // reliably distinguish auth failures (401) / forbidden (403) from other
  // errors without string-matching on the message.
  status?: number;
}

export type ServerResponse<T> =
  | ApiErrorServerResponse
  | SuccessServerResponse<T>;
