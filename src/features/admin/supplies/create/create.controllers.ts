import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody } from "./create.schemas";

export async function create(request: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) {
  const createdSupply = await request.server.admin.supplies.create(request.body);

  return reply.status(201).send(createdSupply);
}
