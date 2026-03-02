import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody } from "./create.schemas";

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as CreateBody;

  const createdUnit = await request.server.admin.units.create(body);

  return reply.status(201).send(createdUnit);
}
