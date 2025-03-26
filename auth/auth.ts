import Credentials from "next-auth/providers/credentials";
export type Awaitable<T> = T | PromiseLike<T>;

import {AdapterUser} from "@auth/core/adapters";
import NextAuth, {AuthError} from "next-auth";
import {fetchNewAccessTokenByRefreshToken, fetchToken, getUserData} from "./auth-actions";
import {MyUser} from "./auth-types";

export const {handlers, auth, signIn, signOut} = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: {},
        password: {},
        tenantId: {},
      },
      authorize: async (credentials) => {
        function authorizeError(message: string) {
          return Promise.reject(new AuthError(JSON.stringify(message)));
        }
        try {
          const signInResponse = await fetchToken({
            username: credentials?.username as string,
            password: credentials.password as string,
            tenantId: credentials.tenantId as string,
          });
          if (signInResponse.error_description) {
            return authorizeError(signInResponse.error_description);
          }
          const {access_token, refresh_token, expires_in} = signInResponse;
          const expiration_date = expires_in * 1000 + Date.now();

          const user_data = await getUserData(access_token, refresh_token, expiration_date);
          return user_data;
        } catch (error) {
          return authorizeError(JSON.stringify(error));
        }
      },
    }),
  ],
  pages: {
    signIn: process.env.AUTHJS_SIGNIN_PATH || "/",
    signOut: process.env.AUTHJS_SIGNOUT_PATH || "/",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    signIn({user}) {
      if (user.userName) {
        return true;
      }
      return false;
    },
    async session({session, token}) {
      if (token?.user) {
        const user = token?.user as AdapterUser & MyUser;
        if (user.expiration_date < Date.now()) {
          const {access_token, refresh_token, expires_in} = await fetchNewAccessTokenByRefreshToken(
            user.refresh_token || "",
          );

          if (access_token && refresh_token) {
            user.access_token = access_token;
            user.refresh_token = refresh_token;
            user.expiration_date = expires_in * 1000 + Date.now();
          }
        }
        session.user = user;
      }
      return session;
    },
    authorized: async ({auth}) => {
      // Logged in users are authenticated, otherwise redirect to login page
      return !!auth;
    },
    async jwt({token, trigger, session, user}) {
      if (user) {
        token.user = user;
      }
      if (trigger === "update") {
        if (session.info) {
          token.user = {
            ...(token.user as object),
            ...session.info,
          };
        }
      }
      return token;
    },
  },
});
