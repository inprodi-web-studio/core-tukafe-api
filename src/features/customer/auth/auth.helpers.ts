import { badRequest, conflict, notFound, throwMappedError } from "@core/utils";
import type { FastifyInstance } from "fastify";

export interface CustomerAccess {
  id: string;
  role: string;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  isCustomer: boolean;
}

export async function getCustomerAccessByIdentifier(
  fastify: FastifyInstance,
  input: { email?: string; phone?: string },
): Promise<CustomerAccess | undefined> {
  const user = input.email
    ? await fastify.db.query.userDB.findFirst({
        where(userTable, { eq }) {
          return eq(userTable.email, input.email!);
        },
      })
    : input.phone
      ? await fastify.db.query.userDB.findFirst({
          where(userTable, { eq }) {
            return eq(userTable.phoneNumber, input.phone!);
          },
        })
      : undefined;

  if (!user) {
    return undefined;
  }

  const customer = await fastify.db.query.customersDB.findFirst({
    where(customerTable, { and, eq, isNull }) {
      return and(eq(customerTable.userId, user.id), isNull(customerTable.deletedAt));
    },
  });

  return {
    id: user.id,
    role: user.role,
    phoneNumber: user.phoneNumber ?? null,
    phoneNumberVerified: user.phoneNumberVerified,
    isCustomer: Boolean(customer),
  };
}

export function mapSignupError(e: unknown): never {
  throwMappedError(e, {
    map: {
      USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: () =>
        conflict("auth.emailAlreadyExists", "An account with this email already exists"),
      FAILED_TO_CREATE_USER: () =>
        conflict("auth.phoneAlreadyExists", "An account with this phone already exists"),
    },
    codePaths: [["body", "code"]],
  });
}

export function mapResendError(e: unknown): never {
  throwMappedError(e, {
    map: {
      PHONE_NUMBER_NOT_EXIST: () =>
        notFound("auth.phoneNotRegistered", "Phone number is not registered"),
    },
    codePaths: [["body", "code"]],
  });
}

export function mapVerificationError(e: unknown): never {
  throwMappedError(e, {
    map: {
      INVALID_OTP: () => badRequest("auth.invalidOTP", "The verification code is incorrect"),
      OTP_EXPIRED: () => badRequest("auth.otpExpired", "The verification code has expired"),
      OTP_NOT_FOUND: () =>
        badRequest("auth.otpNotFound", "No pending verification found for this phone number"),
      TOO_MANY_ATTEMPTS: () => badRequest("auth.tooManyAttempts", "Too many attempts"),
    },
    codePaths: [["body", "code"]],
  });
}

export function mapLoginError(e: unknown): never {
  throwMappedError(e, {
    map: {
      INVALID_EMAIL_OR_PASSWORD: () =>
        badRequest("auth.invalidCredentials", "Invalid email or password"),
      INVALID_PHONE_NUMBER_OR_PASSWORD: () =>
        badRequest("auth.invalidCredentials", "Invalid phone number or password"),
      PHONE_NUMBER_NOT_VERIFIED: () =>
        badRequest("auth.phoneNotVerified", "Phone number must be verified before login"),
    },
    codePaths: [["body", "code"]],
  });
}
