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
  const { member } = request.auth;
  const paymentAttempt = await request.server.admin.orders.createPaymentAttempt({
    organizationId: member.organizationId,
    ...request.body,
  });

  return reply.status(201).send(paymentAttempt);
}

export async function recordPaymentAttemptResult(
  request: FastifyRequest<{
    Params: RecordPaymentAttemptResultParams;
    Body: RecordPaymentAttemptResultBody;
  }>,
  reply: FastifyReply,
) {
  const paymentAttempt = await request.server.admin.orders.recordPaymentAttemptResult({
    paymentAttemptId: request.params.paymentAttemptId,
    ...request.body,
  });

  return reply.status(200).send(paymentAttempt);
}
