import { customerCashbackLedgerDB, ordersDB } from "@core/db/schemas";
import { paginate } from "@core/utils";
import { desc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { CashbackMovementsQuery } from "./cashback.schemas";

export async function getCashbackSummary(request: FastifyRequest, reply: FastifyReply) {
  const customerId = request.customerAuth.customer.id;

  const account = await request.server.db.query.customerCashbackAccountsDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.customerId, customerId);
    },
    columns: {
      balanceCents: true,
      totalEarnedCents: true,
      totalRedeemedCents: true,
    },
  });

  return reply.status(200).send({
    balanceCents: account?.balanceCents ?? 0,
    totalEarnedCents: account?.totalEarnedCents ?? 0,
    totalRedeemedCents: account?.totalRedeemedCents ?? 0,
  });
}

export async function listCashbackMovements(
  request: FastifyRequest<{ Querystring: CashbackMovementsQuery }>,
  reply: FastifyReply,
) {
  const customerId = request.customerAuth.customer.id;

  const movements = await paginate({
    executor: request.server.db,
    createQuery: () =>
      request.server.db
        .select({
          id: customerCashbackLedgerDB.id,
          type: customerCashbackLedgerDB.movementType,
          amountCents: customerCashbackLedgerDB.amountCents,
          balanceAfterCents: customerCashbackLedgerDB.balanceAfterCents,
          organizationId: customerCashbackLedgerDB.organizationId,
          createdAt: customerCashbackLedgerDB.createdAt,
          orderId: ordersDB.id,
          orderFolio: ordersDB.folio,
        })
        .from(customerCashbackLedgerDB)
        .leftJoin(ordersDB, eq(customerCashbackLedgerDB.orderId, ordersDB.id))
        .where(eq(customerCashbackLedgerDB.customerId, customerId))
        .$dynamic(),
    orderBy: [desc(customerCashbackLedgerDB.createdAt), desc(customerCashbackLedgerDB.id)],
    page: request.query.page,
    pageSize: request.query.pageSize,
    mapRow: (movement) => ({
      id: movement.id,
      type: movement.type,
      amountCents: movement.amountCents,
      balanceAfterCents: movement.balanceAfterCents,
      organizationId: movement.organizationId,
      createdAt: movement.createdAt,
      order:
        movement.orderId && movement.orderFolio
          ? {
              id: movement.orderId,
              folio: movement.orderFolio,
            }
          : null,
    }),
  });

  return reply.status(200).send(movements);
}
