import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Negotiator from "negotiator";
import { match as matchLocale } from "@formatjs/intl-localematcher";
import type { NextAuthRequest } from "node_modules/next-auth/lib";
import { auth } from "@repo/utils/auth/next-auth";
import { MyUser } from "./auth-types";
import type { NextProxy } from "next/server";

const homeRoute = process.env.HOME_ROUTE || "/";
const protectAllRoutes = process.env.PROTECT_ALL_ROUTES === "true";
const isAdminPanel = process.env.IS_ADMIN_PANEL === "true";

export const i18n = {
  defaultLocale: process.env.DEFAULT_LOCALE || "en",
  locales: process.env.SUPPORTED_LOCALES?.split(",") || ["en", "tr"],
};

function getLocaleFromBrowser(request: NextRequest) {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));
  const locales = i18n.locales;
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages(
    locales
  );
  return matchLocale(languages, locales, i18n.defaultLocale);
}
function getLocaleFromCookies(request: NextRequest) {
  const cookieLocale = request.cookies.get("locale")?.value;
  if (cookieLocale && i18n.locales.includes(cookieLocale)) {
    return cookieLocale;
  }
}
function getLocaleFromRequest(request: NextRequest) {
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const locale = acceptLanguage.split(",")[0] || "".split("-")[0];
    if (i18n.locales.includes(locale || "")) {
      return locale;
    }
  }
  return i18n.defaultLocale;
}
function getLocale(request: NextRequest) {
  return (
    getLocaleFromCookies(request) ||
    getLocaleFromBrowser(request) ||
    getLocaleFromRequest(request)
  );
}
function isUserAuthorized(request: NextAuthRequest) {
  const user = request.auth?.user as MyUser;
  if (isAdminPanel) {
    return Boolean(user?.access_token && user.role === "admin");
  }
  return Boolean(user?.access_token && (user.userName || user.email));
}

export const middleware: NextProxy = auth((request: NextAuthRequest) => {
  if (request.headers.has("next-action")) {
    return NextResponse.next();
  }

  const url = request.url;
  const { pathname, search } = new URL(url);
  const pathParts = pathname.split("/").filter(Boolean);

  // 1. Locale Detection & Redirection
  const locale = pathParts[0];
  const isValidLocale = i18n.locales.includes(locale || "");
  if (!isValidLocale) {
    const detectedLocale = getLocale(request);
    const newUrl = request.nextUrl.clone();
    newUrl.pathname = `/${detectedLocale}${pathname}`;
    const response = NextResponse.redirect(newUrl);
    response.cookies.set("locale", detectedLocale || "");
    return response;
  }

  // Sync cookie if different
  if (request.cookies.get("locale")?.value !== locale) {
    const response = NextResponse.next();
    response.cookies.set("locale", locale || "");
    // Note: We continue logic after set, but Next.js middleware returns often early.
    // For consistency, we'll use the sync'd response later if not redirected.
  }

  // 2. Route Classification
  const isAuthenticated = isUserAuthorized(request);
  const route = pathParts[1] || ""; // The part after [lang] (e.g., "" for /en/, "login" for /en/login)

  // Normalize routes from env: trim and remove leading slash so "/" becomes ""
  const authRoutesEnv = (process.env.UNAUTHORIZED_ROUTES || "").trim();
  const authRoutes = authRoutesEnv
    ? authRoutesEnv.split(",").map((r) => r.trim().replace(/^\/$/, ""))
    : [];
  const publicRoutesEnv = (process.env.PUBLIC_ROUTES || "").trim();
  const publicRoutes = publicRoutesEnv
    ? publicRoutesEnv.split(",").map((r) => r.trim().replace(/^\/$/, ""))
    : [];

  const isAuthRoute = authRoutes.includes(route);
  const isPublicRoute = publicRoutes.includes(route);
  const isMainRoute = !isAuthRoute && !isPublicRoute;

  // console.log({
  //   route,
  //   authRoutes,
  //   publicRoutes,
  //   isAuthRoute,
  //   isMainRoute,
  //   isPublicRoute,
  //   homeRoute,
  //   protectAllRoutes,
  // });

  // 3. Authorization Logic
  if (isAuthenticated) {
    // Logged in users shouldn't access (auth) routes like /login
    if (isAuthRoute) {
      const targetHome = homeRoute.replace(/^\//, "");
      if (route !== targetHome) {
        const newUrl = request.nextUrl.clone();
        newUrl.pathname = `/${locale}/${targetHome}`;
        return NextResponse.redirect(newUrl);
      }
    }
  } else {
    // When protectAllRoutes=true, protect all routes except public and auth routes
    if (protectAllRoutes && !isPublicRoute && !isAuthRoute) {
      // If accessing root locale path (e.g., /en), redirect to home after login
      // Otherwise, the user would be redirected back to /en which doesn't exist (404)
      const targetAfterLogin =
        route === ""
          ? `/${locale}/${homeRoute.replace(/^\//, "")}`
          : pathname + search;

      const redirectTo = encodeURIComponent(targetAfterLogin);
      const loginRoute = (process.env.LOGIN_ROUTE || "login").replace(
        /^\//,
        ""
      );
      const newUrl = request.nextUrl.clone();
      newUrl.pathname = `/${locale}/${loginRoute}`;
      newUrl.searchParams.set("redirectTo", redirectTo);
      return NextResponse.redirect(newUrl);
    }
  }

  return NextResponse.next();
}) as NextProxy;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
