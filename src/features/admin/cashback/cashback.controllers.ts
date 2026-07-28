import type { FastifyReply, FastifyRequest } from "fastify";
import type { CashbackListQuery, CreateCashbackAdjustmentBody } from "./cashback.schemas";

export async function listCashbackMovements(
  request: FastifyRequest<{ Querystring: CashbackListQuery }>,
  reply: FastifyReply,
) {
  const movements = await request.server.admin.cashback.list(request.query);

  return reply.status(200).send(movements);
}

export async function createCashbackAdjustment(
  request: FastifyRequest<{ Body: CreateCashbackAdjustmentBody }>,
  reply: FastifyReply,
) {
  const adjustment = await request.server.admin.cashback.createAdjustment({
    ...request.body,
    createdByUserId: request.auth.user.id,
  });

  return reply.status(201).send(adjustment);
}
