import type { FastifyReply, FastifyRequest } from "fastify";
import type { QueryParams } from "./list.schemas";

export async function list(request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) {
  const result = await request.server.admin.coupons.list(request.query);

  return reply.status(200).send(result);
}
