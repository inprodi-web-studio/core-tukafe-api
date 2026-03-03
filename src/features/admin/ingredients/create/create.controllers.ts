import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody } from "./create.schemas";

export async function create(request: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) {
  const createdIngredient = await request.server.admin.ingredients.create(request.body);

  return reply.status(201).send(createdIngredient);
}
