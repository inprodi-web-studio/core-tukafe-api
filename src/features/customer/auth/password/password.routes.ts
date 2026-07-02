import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import {
  changePassword,
  requestPasswordReset,
  resetPassword,
  validatePasswordResetCode,
} from "./password.controllers";
import {
  changePasswordBodySchema,
  changePasswordResponseSchema,
  passwordResetResponseSchema,
  requestPasswordResetBodySchema,
  resetPasswordBodySchema,
  validatePasswordResetCodeBodySchema,
  type ChangePasswordBody,
  type RequestPasswordResetBody,
  type ResetPasswordBody,
  type ValidatePasswordResetCodeBody,
} from "./password.schemas";

export async function passwordRoutes(server: FastifyInstance) {
  server.post<{ Body: ChangePasswordBody }>(
    "/change",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        body: changePasswordBodySchema,
        response: {
          200: changePasswordResponseSchema,
        },
      },
    },
    changePassword,
  );

  server.post<{ Body: RequestPasswordResetBody }>(
    "/reset/request",
    {
      schema: {
        body: requestPasswordResetBodySchema,
        response: {
          200: passwordResetResponseSchema,
        },
      },
    },
    requestPasswordReset,
  );

  server.post<{ Body: ResetPasswordBody }>(
    "/reset/confirm",
    {
      schema: {
        body: resetPasswordBodySchema,
        response: {
          200: passwordResetResponseSchema,
        },
      },
    },
    resetPassword,
  );

  server.post<{ Body: ValidatePasswordResetCodeBody }>(
    "/reset/verify-code",
    {
      schema: {
        body: validatePasswordResetCodeBodySchema,
        response: {
          200: passwordResetResponseSchema,
        },
      },
    },
    validatePasswordResetCode,
  );
}
