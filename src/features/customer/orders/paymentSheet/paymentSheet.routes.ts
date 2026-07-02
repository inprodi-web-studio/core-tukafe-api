import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { confirmPaymentAttempt, createPaymentSheet } from "./paymentSheet.controllers";
import {
  confirmPaymentAttemptParamsSchema,
  confirmPaymentAttemptResponseSchema,
  createPaymentSheetBodySchema,
  createPaymentSheetResponseSchema,
  type ConfirmPaymentAttemptParams,
  type CreatePaymentSheetBody,
} from "./paymentSheet.schemas";

export async function paymentSheetRoutes(server: FastifyInstance) {
  server.post<{ Body: CreatePaymentSheetBody }>(
    "/payment-sheet",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        body: createPaymentSheetBodySchema,
        response: {
          201: createPaymentSheetResponseSchema,
        },
      },
    },
    createPaymentSheet,
  );

  server.post<{ Params: ConfirmPaymentAttemptParams }>(
    "/payment-attempts/:paymentAttemptId/confirm",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        params: confirmPaymentAttemptParamsSchema,
        response: {
          200: confirmPaymentAttemptResponseSchema,
        },
      },
    },
    confirmPaymentAttempt,
  );
}
