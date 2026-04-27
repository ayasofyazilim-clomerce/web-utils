import { ApiError } from "@repo/core-saas/AccountService";
import { notFound, permanentRedirect, RedirectType } from "next/navigation";
import { ApiErrorServerResponse, ServerResponse } from "./types";

export function isApiError(error: unknown): error is ApiError {
  if ((error as ApiError).name === "ApiError") {
    return true;
  }
  return error instanceof ApiError;
}
export function isThrowedError(
  error: unknown
): error is ApiErrorServerResponse {
  if ((error as ApiErrorServerResponse).type === "api-error") {
    return true;
  }

  return false;
}
export function structuredError(error: unknown): ApiErrorServerResponse {
  if (isApiError(error)) {
    const body = error.body as
      | { error: { message?: string; details?: string } }
      | undefined;
    const errorDetails = body?.error || {};
    return {
      type: "api-error",
      data: errorDetails.message || error.statusText || "Something went wrong",
      message:
        errorDetails.details ||
        errorDetails.message ||
        error.statusText ||
        "Something went wrong",
    };
  }
  if (isThrowedError(error)) {
    return error;
  }
  return {
    type: "api-error",
    message: "[Unknown] Something went wrong",
    data: "[Unknown] Something went wrong",
  };
}

export function structuredResponse<T>(data: T): ServerResponse<T> {
  return { type: "success", data, message: "" };
}

export function isErrorOnRequest<T>(
  response: ServerResponse<T>,
  lang: string,
  redirectToNotFound = true
): response is { type: "api-error"; message: string; data: string } {
  if (response.type === "success") return false;

  if (response.data === "Forbidden") {
    return permanentRedirect(`/${lang}/unauthorized`, RedirectType.replace);
  }

  if (redirectToNotFound) {
    return notFound();
  }
  return true;
}

export function structuredSuccessResponse<T>(data: T) {
  return { type: "success" as const, data, message: "" };
}

export function withPerformanceLogging<
  T extends { request: { request: (...args: any[]) => any } },
>(client: T, serviceName: string): T {
  const originalRequest = client.request.request.bind(client.request);
  client.request.request = function (options: { method: string; url: string }) {
    const start = performance.now();
    const promise = originalRequest(options);
    promise.then(
      () => {
        // \x1b[32m = Green | \x1b[33m = Yellow | \x1b[0m = Reset
        console.log(
          `\x1b[32m[BACKEND CALL]\x1b[0m ${serviceName} ${options.method} ${options.url} \x1b[33mtook ${(performance.now() - start).toFixed(2)} ms\x1b[0m`
        );
      },
      () => {
        // \x1b[31m = Red | \x1b[1m = Bold
        console.log(
          `\x1b[31m\x1b[1m[BACKEND CALL] FAILED\x1b[0m ${serviceName} ${options.method} ${options.url} \x1b[33mafter ${(performance.now() - start).toFixed(2)} ms\x1b[0m`
        );
      }
    );
    return promise;
  };
  return client;
}
