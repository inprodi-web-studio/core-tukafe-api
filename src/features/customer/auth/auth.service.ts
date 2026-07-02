import { hashPassword, verifyPassword } from "better-auth/crypto";
import { compare as compareBcrypt } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

import {
  accountDB,
  customerQrLoginTokensDB,
  customersDB,
  legacyCustomerPasswordsDB,
  ordersDB,
  verificationDB,
} from "@core/db/schemas";
import {
  badRequest,
  conflict,
  generateNanoId,
  normalizePresets,
  normalizeString,
  unauthorized,
} from "@core/utils";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  getCustomerAccessByIdentifier,
  mapChangePasswordError,
  mapLoginError,
  mapPasswordResetError,
  mapResendError,
  mapSignupError,
  mapVerificationError,
} from "./auth.helpers";
import type { CustomerAuthService, SignupResponse } from "./auth.types";

const QR_LOGIN_TOKEN_TTL_MS = 2 * 60 * 1000;
const QR_LOGIN_PAYLOAD_PREFIX = "tukafe://customer-login?token=";

function hashQrLoginToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function buildQrLoginPayload(rawToken: string): string {
  return `${QR_LOGIN_PAYLOAD_PREFIX}${encodeURIComponent(rawToken)}`;
}

async function isCredentialPasswordValid(
  fastify: FastifyInstance,
  input: { userId: string; password: string },
) {
  const account = await fastify.db.query.accountDB.findFirst({
    where(table, { and, eq }) {
      return and(eq(table.userId, input.userId), eq(table.providerId, "credential"));
    },
    columns: {
      password: true,
    },
  });

  if (!account?.password) {
    return false;
  }

  try {
    return await verifyPassword({
      hash: account.password,
      password: input.password,
    });
  } catch {
    return false;
  }
}

function getAuthErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const body = "body" in error ? (error as { body?: unknown }).body : undefined;

  if (body && typeof body === "object" && "code" in body) {
    const code = (body as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  if ("code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function isInvalidCredentialLoginError(error: unknown) {
  const code = getAuthErrorCode(error);
  return code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PHONE_NUMBER_OR_PASSWORD";
}

async function migrateLegacyCustomerPassword(
  fastify: FastifyInstance,
  input: { userId: string; password: string },
) {
  const legacyPassword = await fastify.db.query.legacyCustomerPasswordsDB.findFirst({
    where(table, { eq }) {
      return eq(table.userId, input.userId);
    },
  });

  if (!legacyPassword) {
    return false;
  }

  if (legacyPassword.algorithm !== "legacy-bcrypt") {
    return false;
  }

  const isValid = await compareBcrypt(input.password, legacyPassword.passwordHash);

  if (!isValid) {
    return false;
  }

  const passwordHash = await hashPassword(input.password);

  await fastify.db.transaction(async (tx) => {
    await tx
      .insert(accountDB)
      .values({
        id: generateNanoId(),
        userId: input.userId,
        accountId: input.userId,
        providerId: "credential",
        password: passwordHash,
      })
      .onConflictDoUpdate({
        target: [accountDB.providerId, accountDB.accountId],
        set: {
          password: passwordHash,
          updatedAt: new Date(),
        },
      });

    await tx
      .delete(legacyCustomerPasswordsDB)
      .where(eq(legacyCustomerPasswordsDB.userId, input.userId));
  });

  return true;
}

async function ensureCredentialPasswordValidOrMigrated(
  fastify: FastifyInstance,
  input: { userId: string; password: string },
) {
  const passwordIsValid = await isCredentialPasswordValid(fastify, input);

  if (passwordIsValid) {
    return true;
  }

  return await migrateLegacyCustomerPassword(fastify, input);
}

export function customerAuthService(fastify: FastifyInstance): CustomerAuthService {
  return {
    async createQrLoginToken({ customerId }) {
      const rawToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + QR_LOGIN_TOKEN_TTL_MS);

      await fastify.db.insert(customerQrLoginTokensDB).values({
        id: generateNanoId(),
        customerId,
        tokenHash: hashQrLoginToken(rawToken),
        expiresAt,
      });

      return {
        payload: buildQrLoginPayload(rawToken),
        expiresAt: expiresAt.toISOString(),
      };
    },

    async signupWithPhone({ name, middleName, lastName, email, phone, password }) {
      let userId: string | undefined;

      let sessionToken: string | undefined;

      try {
        const { user, token } = await fastify.auth.api.signUpEmail({
          body: {
            name,
            middleName,
            lastName,
            email,
            password,
            phoneNumber: phone,
          },
        });

        userId = user.id;
        sessionToken = token ?? undefined;
      } catch (e) {
        mapSignupError(e);
      }

      if (!sessionToken) {
        throw new Error("Failed to obtain session token after signup");
      }

      try {
        await fastify.auth.api.sendPhoneNumberOTP({
          body: { phoneNumber: phone },
        });
      } catch (e) {
        mapResendError(e);
      }

      const response: SignupResponse = {
        userId,
        email,
        phone,
      };

      return response;
    },

    async loginWithEmailOrPhone({ email, phone, password }, requestHeaders) {
      const normalizedEmail = email ? normalizeString(email, normalizePresets.email) : undefined;
      const normalizedPhone = phone ? normalizeString(phone, normalizePresets.phone) : undefined;

      const userAccess = await getCustomerAccessByIdentifier(fastify, {
        email: normalizedEmail,
        phone: normalizedPhone,
      });

      if (normalizedPhone && userAccess) {
        const passwordIsValid = await ensureCredentialPasswordValidOrMigrated(fastify, {
          userId: userAccess.id,
          password,
        });

        if (!passwordIsValid) {
          throw badRequest("auth.invalidCredentials", "Invalid phone number or password");
        }
      }

      let responseToken: string | null = null;
      let headerToken: string | null = null;
      let userId = "";
      let userEmail: string | null = null;
      let userPhone = normalizedPhone ?? userAccess?.phoneNumber ?? "";

      try {
        if (normalizedEmail) {
          const { response, headers } = await fastify.auth.api.signInEmail({
            body: {
              email: normalizedEmail,
              password,
              rememberMe: true,
            },
            headers: requestHeaders,
            returnHeaders: true,
          });

          userId = response.user.id ?? "";
          userEmail = response.user.email ?? null;
          userPhone = response.user.phoneNumber ?? userPhone;
          responseToken = response.token ?? null;
          headerToken = headers.get("set-auth-token");
        } else {
          const { response, headers } = await fastify.auth.api.signInPhoneNumber({
            body: {
              phoneNumber: normalizedPhone!,
              password,
              rememberMe: true,
            },
            headers: requestHeaders,
            returnHeaders: true,
          });

          userId = response.user.id ?? "";
          userEmail = response.user.email ?? null;
          userPhone = response.user.phoneNumber ?? userPhone;
          responseToken = response.token ?? null;
          headerToken = headers.get("set-auth-token");
        }
      } catch (e) {
        let recoveredWithLegacyPassword = false;

        if (
          normalizedEmail &&
          userAccess &&
          isInvalidCredentialLoginError(e) &&
          (await migrateLegacyCustomerPassword(fastify, {
            userId: userAccess.id,
            password,
          }))
        ) {
          try {
            const { response, headers } = await fastify.auth.api.signInEmail({
              body: {
                email: normalizedEmail,
                password,
                rememberMe: true,
              },
              headers: requestHeaders,
              returnHeaders: true,
            });

            userId = response.user.id ?? "";
            userEmail = response.user.email ?? null;
            userPhone = response.user.phoneNumber ?? userPhone;
            responseToken = response.token ?? null;
            headerToken = headers.get("set-auth-token");
            recoveredWithLegacyPassword = true;
          } catch (retryError) {
            mapLoginError(retryError);
          }
        }

        if (!recoveredWithLegacyPassword) {
          mapLoginError(e);
        }
      }

      if (userAccess && (!userAccess.phoneNumber || userAccess.phoneNumberVerified !== true)) {
        throw badRequest("auth.phoneNotVerified", "Phone number must be verified before login");
      }

      if (userAccess && !userAccess.isCustomer) {
        throw unauthorized(
          "auth.customerAccessOnly",
          "This account is not enabled for customer access",
        );
      }

      const token = headerToken ?? responseToken;

      if (!token || !userId || !userPhone) {
        throw badRequest("auth.loginFailed", "Failed to login");
      }

      return {
        token,
        userId,
        email: userEmail,
        phone: userPhone,
      };
    },

    async resendOTP({ phone }) {
      try {
        await fastify.auth.api.sendPhoneNumberOTP({
          body: { phoneNumber: phone },
        });
      } catch (e) {
        mapResendError(e);
      }
    },

    async verifyPhone({ phone, code }) {
      let result: Awaited<ReturnType<typeof fastify.auth.api.verifyPhoneNumber>>;

      try {
        result = await fastify.auth.api.verifyPhoneNumber({
          body: {
            phoneNumber: phone,
            code,
            disableSession: false,
          },
        });
      } catch (e) {
        mapVerificationError(e);
      }

      if (!result.status || !result.token) {
        throw badRequest("auth.verificationFailed", "Phone verification failed");
      }

      const user = result.user;
      const normalizedPhone = normalizeString(user.phoneNumber ?? phone, normalizePresets.phone);
      const persistedUser = await fastify.db.query.userDB.findFirst({
        where(table, { eq }) {
          return eq(table.id, user.id);
        },
        columns: {
          name: true,
          middleName: true,
          lastName: true,
          email: true,
        },
      });

      const customerName = persistedUser?.name ?? user.name ?? null;
      const customerMiddleName = persistedUser?.middleName ?? null;
      const customerLastName = persistedUser?.lastName ?? null;
      const customerEmail = persistedUser?.email ?? user.email ?? null;

      await fastify.db.transaction(async (tx) => {
        const [existingCustomerByPhone, existingCustomerByUser] = await Promise.all([
          tx.query.customersDB.findFirst({
            where(table, { and, eq, isNull }) {
              return and(eq(table.phone, normalizedPhone), isNull(table.deletedAt));
            },
            columns: {
              id: true,
              userId: true,
            },
          }),
          tx.query.customersDB.findFirst({
            where(table, { and, eq, isNull }) {
              return and(eq(table.userId, user.id), isNull(table.deletedAt));
            },
            columns: {
              id: true,
              userId: true,
            },
          }),
        ]);

        if (
          existingCustomerByPhone &&
          existingCustomerByPhone.userId &&
          existingCustomerByPhone.userId !== user.id
        ) {
          throw conflict(
            "auth.phoneAlreadyLinked",
            "This phone number is already linked to another account",
          );
        }

        let targetCustomerId = existingCustomerByPhone?.id ?? existingCustomerByUser?.id ?? null;

        if (
          existingCustomerByPhone &&
          existingCustomerByUser &&
          existingCustomerByPhone.id !== existingCustomerByUser.id
        ) {
          // Merge purchases under the phone-based customer identity.
          await tx
            .update(ordersDB)
            .set({ customerId: existingCustomerByPhone.id })
            .where(eq(ordersDB.customerId, existingCustomerByUser.id));

          await tx
            .update(customersDB)
            .set({
              userId: null,
              deletedAt: new Date(),
            })
            .where(eq(customersDB.id, existingCustomerByUser.id));

          targetCustomerId = existingCustomerByPhone.id;
        }

        if (targetCustomerId) {
          await tx
            .update(customersDB)
            .set({
              userId: user.id,
              phone: normalizedPhone,
              name: customerName,
              middleName: customerMiddleName,
              lastName: customerLastName,
              email: customerEmail,
              deletedAt: null,
            })
            .where(eq(customersDB.id, targetCustomerId));

          return;
        }

        await tx.insert(customersDB).values({
          id: generateNanoId(),
          userId: user.id,
          phone: normalizedPhone,
          name: customerName,
          middleName: customerMiddleName,
          lastName: customerLastName,
          email: customerEmail,
        });
      });

      return {
        token: result.token,
        userId: user.id,
        email: user.email,
        phone: user.phoneNumber ?? phone,
      };
    },

    async changePassword({ currentPassword, newPassword }, requestHeaders) {
      try {
        await fastify.auth.api.changePassword({
          body: {
            currentPassword,
            newPassword,
            revokeOtherSessions: false,
          },
          headers: requestHeaders,
        });
      } catch (e) {
        mapChangePasswordError(e);
      }
    },

    async requestPasswordReset({ phone }) {
      const normalizedPhone = normalizeString(phone, normalizePresets.phone);

      try {
        await fastify.auth.api.requestPasswordResetPhoneNumber({
          body: {
            phoneNumber: normalizedPhone,
          },
        });
      } catch (e) {
        mapPasswordResetError(e);
      }
    },

    async validatePasswordResetCode({ phone, code }) {
      const normalizedPhone = normalizeString(phone, normalizePresets.phone);
      const phoneResetIdentifier = `${normalizedPhone}-request-password-reset`;
      const verification = await fastify.db.query.verificationDB.findFirst({
        where(table, { eq }) {
          return eq(table.identifier, phoneResetIdentifier);
        },
      });

      if (!verification) {
        throw badRequest("auth.otpNotFound", "No pending verification found for this phone number");
      }

      if (verification.expiresAt < new Date()) {
        throw badRequest("auth.otpExpired", "The verification code has expired");
      }

      const [otpValue, attempts = "0"] = verification.value.split(":");
      const currentAttempts = Number.parseInt(attempts, 10) || 0;
      const allowedAttempts = 5;

      if (currentAttempts >= allowedAttempts) {
        await fastify.db
          .delete(verificationDB)
          .where(eq(verificationDB.identifier, phoneResetIdentifier));

        throw badRequest("auth.tooManyAttempts", "Too many attempts");
      }

      if (code !== otpValue) {
        await fastify.db
          .update(verificationDB)
          .set({ value: `${otpValue}:${currentAttempts + 1}` })
          .where(eq(verificationDB.identifier, phoneResetIdentifier));

        throw badRequest("auth.invalidOTP", "The verification code is incorrect");
      }
    },

    async resetPassword({ phone, code, newPassword }) {
      const normalizedPhone = normalizeString(phone, normalizePresets.phone);

      try {
        await fastify.auth.api.resetPasswordPhoneNumber({
          body: {
            phoneNumber: normalizedPhone,
            otp: code,
            newPassword,
          },
        });
      } catch (e) {
        mapPasswordResetError(e);
      }
    },
  };
}
