import { customerOrderPromotionStatesDB } from "@core/db/schemas";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function getFreeDrinkProgress(request: FastifyRequest, reply: FastifyReply) {
  const customerId = request.customerAuth.customer.id;

  const state = await request.server.db.query.customerOrderPromotionStatesDB.findFirst({
    where: eq(customerOrderPromotionStatesDB.customerId, customerId),
    columns: {
      progressCount: true,
      candidateProductIds: true,
    },
  });

  const progressCount = Math.max(0, Math.min(state?.progressCount ?? 0, 4));
  const candidateProductIds = Array.isArray(state?.candidateProductIds)
    ? state.candidateProductIds.filter((value): value is string => typeof value === "string")
    : [];

  return reply.status(200).send({
    progressCount,
    candidateProductIds,
    eligibleForFreeDrink: progressCount === 4,
  });
}
