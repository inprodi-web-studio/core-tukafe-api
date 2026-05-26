import type { FastifyReply, FastifyRequest } from "fastify";
import type { PreviewBody } from "./preview.schemas";

export async function preview(
  request: FastifyRequest<{ Body: PreviewBody }>,
  reply: FastifyReply,
) {
  const previewResult = await request.server.guest.orders.preview(request.body);

  return reply.status(200).send(previewResult);
}
