import type { FastifyReply, FastifyRequest } from "fastify";
import type { FindOrCreateBody } from "./findOrCreate.schemas";

export async function findOrCreate(
  request: FastifyRequest<{ Body: FindOrCreateBody }>,
  reply: FastifyReply,
) {
  const customerResult = await request.server.guest.customers.findOrCreateByPhone(request.body);

  return reply.status(200).send(customerResult);
}
