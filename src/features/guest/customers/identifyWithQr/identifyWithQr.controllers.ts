import type { FastifyReply, FastifyRequest } from "fastify";
import type { IdentifyWithQrBody } from "./identifyWithQr.schemas";

export async function identifyWithQr(
  request: FastifyRequest<{ Body: IdentifyWithQrBody }>,
  reply: FastifyReply,
) {
  const customerResult = await request.server.guest.customers.identifyWithQr(request.body);

  return reply.status(200).send(customerResult);
}
