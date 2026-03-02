import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody } from "./create.schemas";

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const data = request.body as CreateBody;

  const createdCategory = await request.server.admin.productCategories.create(data);

  return reply.status(201).send(createdCategory);
}
