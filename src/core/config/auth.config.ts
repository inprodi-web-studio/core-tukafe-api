import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";

import { env } from "@core/config/env.config";
import { db } from "@core/db";
import { accountDB, sessionDB, userDB, verificationDB } from "@core/db/schemas";
import { TRUSTED_ORIGINS } from "@core/constants";
import { ac, AUTH_ROLES } from "./permissions.config";

export const auth = betterAuth({
  appName: "TuKafe",
  baseURL: env.API_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      account: accountDB,
      session: sessionDB,
      user: userDB,
      verification: verificationDB,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin({
      defaultRole: "customer",
      adminRoles: ["admin", "member"],
      ac,
      roles: AUTH_ROLES,
    }),
  ],
  trustedOrigins: TRUSTED_ORIGINS,
});
