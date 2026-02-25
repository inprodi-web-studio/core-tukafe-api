import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { phoneNumber } from "better-auth/plugins/phone-number";

import { env } from "@core/config/env.config";
import { TRUSTED_ORIGINS } from "@core/constants";
import { db } from "@core/db";
import {
  accountDB,
  invitationDB,
  memberDB,
  organizationDB,
  sessionDB,
  userDB,
  verificationDB,
} from "@core/db/schemas";
import { resolveGeolocation } from "@core/utils";
import { ORGANIZATION_AC, ORGANIZATION_ROLES } from "./permissions.config";

export const auth = betterAuth({
  appName: "TuKafe",
  baseURL: env.API_URL,
  basePath: "/authx",
  trustedOrigins: TRUSTED_ORIGINS,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      account: accountDB,
      invitation: invitationDB,
      member: memberDB,
      organization: organizationDB,
      session: sessionDB,
      user: userDB,
      verification: verificationDB,
    },
  }),
  advanced: {
    cookiePrefix: "tukafe",
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      middleName: {
        type: "string",
        required: false,
      },
      lastName: {
        type: "string",
        required: false,
      },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: ({ phoneNumber, code }, ctx) => {
        //TODO: Send with twilio
        console.log(`[OTP] ${phoneNumber}: ${code}`);
      },
    }),
    organization({
      allowUserToCreateOrganization: async (user) =>
        user.role === "owner" || user.role === "admin" || user.role === "member",
      ac: ORGANIZATION_AC,
      roles: ORGANIZATION_ROLES,
      teams: {
        enabled: false,
      },
      schema: {
        session: {
          fields: {
            activeOrganizationId: "activeOrganizationId",
          },
        },
        organization: {
          additionalFields: {
            address: {
              type: "string",
              required: true,
            },
          },
        },
      },
    }),
  ],
  databaseHooks: {
    session: {
      create: {
        async before(session) {
          const members = await db.query.memberDB.findMany({
            where(member, { eq }) {
              return eq(member.userId, session.userId);
            },
          });

          const { city, country } = await resolveGeolocation(session.ipAddress);

          if (members.length === 0) {
            return {
              data: {
                ...session,
                city,
                country,
              },
            };
          }

          const defaultMember = members[0];

          return {
            data: {
              ...session,
              activeOrganizationId: defaultMember?.organizationId,
              city,
              country,
            },
          };
        },
      },
    },
  },
});
