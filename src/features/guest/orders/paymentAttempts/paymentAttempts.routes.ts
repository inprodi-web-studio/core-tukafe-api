import type { FastifyInstance } from "fastify";
import { createPaymentAttempt, recordPaymentAttemptResult } from "./paymentAttempts.controllers";
import {
  createPaymentAttemptBodySchema,
  paymentAttemptResponseSchema,
  recordPaymentAttemptResultBodySchema,
  recordPaymentAttemptResultParamsSchema,
  type CreatePaymentAttemptBody,
  type RecordPaymentAttemptResultBody,
  type RecordPaymentAttemptResultParams,
} from "./paymentAttempts.schemas";

export async function paymentAttemptsRoutes(server: FastifyInstance) {
  server.post<{ Body: CreatePaymentAttemptBody }>(
    "/payment-attempts",
    {
      schema: {
        body: createPaymentAttemptBodySchema,
        response: {
          201: paymentAttemptResponseSchema,
        },
      },
    },
    createPaymentAttempt,
  );

  server.patch<{
    Params: RecordPaymentAttemptResultParams;
    Body: RecordPaymentAttemptResultBody;
  }>(
    "/payment-attempts/:paymentAttemptId/result",
    {
      schema: {
        params: recordPaymentAttemptResultParamsSchema,
        body: recordPaymentAttemptResultBodySchema,
        response: {
          200: paymentAttemptResponseSchema,
        },
      },
    },
    recordPaymentAttemptResult,
  );
}
