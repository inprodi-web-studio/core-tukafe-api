import type { ListQueryParams } from "@core/types";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as ListQueryParams;
  const units = await request.server.admin.units.list(query);

  return reply.status(200).send(units);
}
