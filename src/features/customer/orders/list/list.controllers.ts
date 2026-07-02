import { ordersDB, organizationDB } from "@core/db/schemas";
import { paginate } from "@core/utils";
import { desc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ListCustomerOrdersQuery } from "./list.schemas";

export async function listCustomerOrders(
  request: FastifyRequest<{ Querystring: ListCustomerOrdersQuery }>,
  reply: FastifyReply,
) {
  const customerId = request.customerAuth.customer.id;
  const { page, pageSize } = request.query;

  const orders = await paginate({
    executor: request.server.db,
    createQuery: () =>
      request.server.db
        .select({
          id: ordersDB.id,
          folio: ordersDB.folio,
          createdAt: ordersDB.createdAt,
          grandTotalCents: ordersDB.grandTotalCents,
          organizationId: organizationDB.id,
          organizationName: organizationDB.name,
        })
        .from(ordersDB)
        .innerJoin(organizationDB, eq(ordersDB.organizationId, organizationDB.id))
        .where(eq(ordersDB.customerId, customerId))
        .$dynamic(),
    orderBy: [desc(ordersDB.createdAt), desc(ordersDB.id)],
    page,
    pageSize,
    mapRow: (order) => ({
      id: order.id,
      folio: order.folio,
      createdAt: order.createdAt,
      grandTotalCents: order.grandTotalCents,
      organization: {
        id: order.organizationId,
        name: order.organizationName,
      },
    }),
  });

  return reply.status(200).send(orders);
}
