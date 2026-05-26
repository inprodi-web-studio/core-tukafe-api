import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreatePaymentAttemptBody,
  RecordPaymentAttemptResultBody,
  RecordPaymentAttemptResultParams,
} from "./paymentAttempts.schemas";

export async function createPaymentAttempt(
  request: FastifyRequest<{ Body: CreatePaymentAttemptBody }>,
  reply: FastifyReply,
) {
  const paymentAttempt = await request.server.guest.orders.createPaymentAttempt(request.body);

  return reply.status(201).send(paymentAttempt);
}

export async function recordPaymentAttemptResult(
  request: FastifyRequest<{
    Params: RecordPaymentAttemptResultParams;
    Body: RecordPaymentAttemptResultBody;
  }>,
  reply: FastifyReply,
) {
  const paymentAttempt = await request.server.guest.orders.recordPaymentAttemptResult({
    paymentAttemptId: request.params.paymentAttemptId,
    ...request.body,
  });

  return reply.status(200).send(paymentAttempt);
}
