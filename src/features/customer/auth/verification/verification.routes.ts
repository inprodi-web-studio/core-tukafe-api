import { successResponseSchema } from "@core/utils";
import type { FastifyInstance } from "fastify";
import { resendOTP, verifyPhone } from "./verification.controllers";
import {
  resendOTPBodySchema,
  verifyPhoneBodySchema,
  verifyPhoneResponseSchema,
} from "./verification.schemas";

export async function verificationRoutes(server: FastifyInstance) {
  server.post(
    "/resend",
    {
      schema: {
        body: resendOTPBodySchema,
        response: {
          200: successResponseSchema,
        },
      },
    },
    resendOTP,
  );

  server.post(
    "/phone",
    {
      schema: {
        body: verifyPhoneBodySchema,
        response: {
          200: verifyPhoneResponseSchema,
        },
      },
    },
    verifyPhone,
  );
}
