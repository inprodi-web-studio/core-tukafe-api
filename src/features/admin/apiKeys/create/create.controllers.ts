import type { RequestHeaders } from "@core/types";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody } from "./create.schemas";

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as CreateBody;
  const createdApiKey = await request.server.admin.apiKeys.create(
    body,
    request.headers as RequestHeaders,
  );

  return reply.status(201).send(createdApiKey);
}
