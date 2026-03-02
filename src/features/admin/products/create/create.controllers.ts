import type { FastifyReply, FastifyRequest } from "fastify";

export async function create(request: FastifyRequest, reply: FastifyReply) {
  reply.code(201).send(request.auth);
}
