import {
  customerCashbackAccountsDB,
  customerCashbackLedgerDB,
  customersDB,
  ordersDB,
  organizationDB,
  userDB,
} from "@core/db/schemas";
import { generateNanoId, normalizeString, notFound, paginate, validation } from "@core/utils";
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type {
  AdminCashbackMovement,
  AdminCashbackService,
  CashbackDirection,
  CashbackListParams,
  CashbackSource,
} from "./cashback.types";

type TransactionDb = Parameters<Parameters<FastifyInstance["db"]["transaction"]>[0]>[0];
const adjustmentUser = alias(userDB, "cashback_adjustment_user");

function directionExpression() {
  return sql<CashbackDirection>`case
    when ${customerCashbackLedgerDB.movementType} in ('earned', 'adjustment_credit')
      then 'credit'
    else 'debit'
  end`;
}

function sourceExpression() {
  return sql<CashbackSource>`case
    when ${customerCashbackLedgerDB.movementType} in ('earned', 'redeemed')
      then 'order'
    else 'adjustment'
  end`;
}

function resolveOrderBy(
  input: Pick<CashbackListParams, "sortBy" | "sortDirection">,
): [SQL, ...SQL[]] {
  const order = input.sortDirection === "desc" ? desc : asc;
  const column = {
    createdAt: customerCashbackLedgerDB.createdAt,
    customer: customersDB.name,
    amount: customerCashbackLedgerDB.amountCents,
    balanceAfter: customerCashbackLedgerDB.balanceAfterCents,
  }[input.sortBy];

  return [sql`${order(column)} nulls last`, desc(customerCashbackLedgerDB.id)];
}

async function lockCashbackAccount(tx: TransactionDb, customerId: string) {
  await tx
    .insert(customerCashbackAccountsDB)
    .values({
      customerId,
      balanceCents: 0,
      totalEarnedCents: 0,
      totalRedeemedCents: 0,
      version: 0,
    })
    .onConflictDoNothing();

  const result = await tx.execute(sql`
    select balance_cents as "balanceCents"
    from customer_cashback_account
    where customer_id = ${customerId}
    for update
  `);
  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to lock customer cashback account");
  }

  return Number(row.balanceCents ?? 0);
}

function mapMovement(row: {
  id: string;
  type: AdminCashbackMovement["type"];
  direction: CashbackDirection;
  source: CashbackSource;
  amountCents: number;
  balanceAfterCents: number;
  createdAt: Date | null;
  customerId: string;
  customerName: string | null;
  customerMiddleName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  orderId: string | null;
  orderFolio: string | null;
  reason: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdByMiddleName: string | null;
  createdByLastName: string | null;
  createdByEmail: string | null;
}): AdminCashbackMovement {
  if (!row.createdAt) {
    throw new Error("Cashback movement is missing its creation date");
  }

  const order =
    row.orderId && row.orderFolio
      ? {
          id: row.orderId,
          folio: row.orderFolio,
        }
      : null;
  const organization =
    row.organizationId && row.organizationName
      ? {
          id: row.organizationId,
          name: row.organizationName,
        }
      : null;
  const adjustment =
    row.reason && row.createdById && row.createdByName && row.createdByEmail
      ? {
          reason: row.reason,
          createdBy: {
            id: row.createdById,
            name: row.createdByName,
            middleName: row.createdByMiddleName,
            lastName: row.createdByLastName,
            email: row.createdByEmail,
          },
        }
      : null;

  return {
    id: row.id,
    type: row.type,
    direction: row.direction,
    source: row.source,
    amountCents: Number(row.amountCents),
    balanceAfterCents: Number(row.balanceAfterCents),
    createdAt: row.createdAt,
    customer: {
      id: row.customerId,
      name: row.customerName,
      middleName: row.customerMiddleName,
      lastName: row.customerLastName,
      phone: row.customerPhone,
      email: row.customerEmail,
    },
    organization,
    order,
    adjustment,
  };
}

export function adminCashbackService(fastify: FastifyInstance): AdminCashbackService {
  return {
    async list(input) {
      const normalizedSearch = input.search?.trim();
      const direction = directionExpression();
      const source = sourceExpression();
      const orderBy = resolveOrderBy(input);

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [];

          if (normalizedSearch) {
            const pattern = `%${normalizedSearch}%`;
            const searchFilter = or(
              ilike(customersDB.name, pattern),
              ilike(customersDB.middleName, pattern),
              ilike(customersDB.lastName, pattern),
              ilike(customersDB.phone, pattern),
              ilike(customersDB.email, pattern),
              sql`concat_ws(' ', ${customersDB.name}, ${customersDB.middleName}, ${customersDB.lastName}) ilike ${pattern}`,
            );

            if (searchFilter) {
              filters.push(searchFilter);
            }
          }
          if (input.direction) {
            filters.push(sql`${direction} = ${input.direction}`);
          }
          if (input.source) {
            filters.push(sql`${source} = ${input.source}`);
          }

          return fastify.db
            .select({
              id: customerCashbackLedgerDB.id,
              type: customerCashbackLedgerDB.movementType,
              direction,
              source,
              amountCents: customerCashbackLedgerDB.amountCents,
              balanceAfterCents: customerCashbackLedgerDB.balanceAfterCents,
              createdAt: customerCashbackLedgerDB.createdAt,
              customerId: customersDB.id,
              customerName: customersDB.name,
              customerMiddleName: customersDB.middleName,
              customerLastName: customersDB.lastName,
              customerPhone: customersDB.phone,
              customerEmail: customersDB.email,
              organizationId: organizationDB.id,
              organizationName: organizationDB.name,
              orderId: ordersDB.id,
              orderFolio: ordersDB.folio,
              reason: customerCashbackLedgerDB.reason,
              createdById: adjustmentUser.id,
              createdByName: adjustmentUser.name,
              createdByMiddleName: adjustmentUser.middleName,
              createdByLastName: adjustmentUser.lastName,
              createdByEmail: adjustmentUser.email,
            })
            .from(customerCashbackLedgerDB)
            .innerJoin(customersDB, eq(customerCashbackLedgerDB.customerId, customersDB.id))
            .leftJoin(ordersDB, eq(customerCashbackLedgerDB.orderId, ordersDB.id))
            .leftJoin(
              organizationDB,
              eq(customerCashbackLedgerDB.organizationId, organizationDB.id),
            )
            .leftJoin(
              adjustmentUser,
              eq(customerCashbackLedgerDB.createdByUserId, adjustmentUser.id),
            )
            .where(filters.length > 0 ? and(...filters) : undefined)
            .$dynamic();
        },
        orderBy,
        page: input.page,
        pageSize: input.pageSize,
        mapRow: mapMovement,
      });
    },

    async createAdjustment(input) {
      const reason = normalizeString(input.reason, {
        trim: true,
        collapseWhitespace: true,
      });

      return fastify.db.transaction(async (tx) => {
        const [customer] = await tx
          .select({ id: customersDB.id })
          .from(customersDB)
          .where(and(eq(customersDB.id, input.customerId), isNull(customersDB.deletedAt)))
          .limit(1);

        if (!customer) {
          throw notFound("cashback.customerNotFound", "Customer was not found");
        }

        const balanceBeforeCents = await lockCashbackAccount(tx, customer.id);
        const balanceAfterCents =
          input.direction === "credit"
            ? balanceBeforeCents + input.amountCents
            : balanceBeforeCents - input.amountCents;

        if (balanceAfterCents < 0) {
          throw validation(
            "cashback.insufficientBalance",
            "Cashback balance is insufficient for this adjustment",
            {
              balanceCents: balanceBeforeCents,
              requestedCents: input.amountCents,
            },
          );
        }

        await tx
          .update(customerCashbackAccountsDB)
          .set({
            balanceCents: balanceAfterCents,
            version: sql`${customerCashbackAccountsDB.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(customerCashbackAccountsDB.customerId, customer.id));

        const [movement] = await tx
          .insert(customerCashbackLedgerDB)
          .values({
            id: generateNanoId(),
            customerId: customer.id,
            orderId: null,
            organizationId: null,
            createdByUserId: input.createdByUserId,
            reason,
            movementType: input.direction === "credit" ? "adjustment_credit" : "adjustment_debit",
            amountCents: input.amountCents,
            balanceAfterCents,
          })
          .returning({
            id: customerCashbackLedgerDB.id,
            createdAt: customerCashbackLedgerDB.createdAt,
          });

        if (!movement?.createdAt) {
          throw new Error("Failed to create cashback adjustment");
        }

        return {
          id: movement.id,
          customerId: customer.id,
          direction: input.direction,
          amountCents: input.amountCents,
          balanceBeforeCents,
          balanceAfterCents,
          createdAt: movement.createdAt,
        };
      });
    },
  };
}
