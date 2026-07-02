import type { FastifyReply, FastifyRequest } from "fastify";
import type { ConfirmPaymentAttemptParams, CreatePaymentSheetBody } from "./paymentSheet.schemas";

export async function createPaymentSheet(
  request: FastifyRequest<{ Body: CreatePaymentSheetBody }>,
  reply: FastifyReply,
) {
  const { customer } = request.customerAuth;

  const paymentSheet = await request.server.customer.orders.createStripePaymentSheet({
    ...request.body,
    customerId: customer.id,
  });

  return reply.status(201).send(paymentSheet);
}

export async function confirmPaymentAttempt(
  request: FastifyRequest<{ Params: ConfirmPaymentAttemptParams }>,
  reply: FastifyReply,
) {
  const { customer } = request.customerAuth;

  const paymentAttempt = await request.server.customer.orders.confirmStripePaymentAttempt({
    customerId: customer.id,
    paymentAttemptId: request.params.paymentAttemptId,
  });

  return reply.status(200).send(paymentAttempt);
}
