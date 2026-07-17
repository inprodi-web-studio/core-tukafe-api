import type { FastifyReply, FastifyRequest } from "fastify";
import type { Query } from "./ruleOptions.schemas";

export async function listRuleOptions(
  request: FastifyRequest<{ Querystring: Query }>,
  reply: FastifyReply,
) {
  const options = await request.server.admin.coupons.listRuleOptions(request.query);
  return reply.status(200).send(options);
}
