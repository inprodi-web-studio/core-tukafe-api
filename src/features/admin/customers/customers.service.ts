import { customerCashbackAccountsDB, customersDB, ordersDB } from "@core/db/schemas";
import { paginate } from "@core/utils";
import { and, asc, desc, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AdminCustomersService,
  CustomerListItem,
  CustomerListParams,
} from "./customers.types";

function resolveOrderBy(
  { sortBy, sortDirection }: Pick<CustomerListParams, "sortBy" | "sortDirection">,
  orderCount: SQL<number>,
  lastOrderAt: SQL<Date | null>,
): [SQL, ...SQL[]] {
  const order = sortDirection === "desc" ? desc : asc;
  const column = {
    name: customersDB.name,
    phone: customersDB.phone,
    email: customersDB.email,
    orderCount,
    lastOrderAt,
    createdAt: customersDB.createdAt,
  }[sortBy];

  return [sql`${order(column)} nulls last`, desc(customersDB.createdAt), asc(customersDB.id)];
}

export function adminCustomersService(fastify: FastifyInstance): AdminCustomersService {
  return {
    async list(input) {
      const normalizedSearch = input.search?.trim();
      const orderCount = sql<number>`count(${ordersDB.id})::integer`;
      const lastOrderAt = sql<Date | null>`max(${ordersDB.createdAt})`;
      const cashbackBalanceCents = sql<number>`coalesce(${customerCashbackAccountsDB.balanceCents}, 0)::integer`;
      const orderBy = resolveOrderBy(input, orderCount, lastOrderAt);

      const customers = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [isNull(customersDB.deletedAt)];

          if (normalizedSearch) {
            const searchPattern = `%${normalizedSearch}%`;
            const searchFilter = or(
              ilike(customersDB.name, searchPattern),
              ilike(customersDB.middleName, searchPattern),
              ilike(customersDB.lastName, searchPattern),
              ilike(customersDB.phone, searchPattern),
              ilike(customersDB.email, searchPattern),
              sql`concat_ws(' ', ${customersDB.name}, ${customersDB.middleName}, ${customersDB.lastName}) ilike ${searchPattern}`,
            );

            if (searchFilter) {
              filters.push(searchFilter);
            }
          }

          return fastify.db
            .select({
              id: customersDB.id,
              name: customersDB.name,
              middleName: customersDB.middleName,
              lastName: customersDB.lastName,
              phone: customersDB.phone,
              email: customersDB.email,
              cashbackBalanceCents,
              orderCount,
              lastOrderAt,
              createdAt: customersDB.createdAt,
            })
            .from(customersDB)
            .leftJoin(
              customerCashbackAccountsDB,
              sql`${customerCashbackAccountsDB.customerId} = ${customersDB.id}`,
            )
            .leftJoin(ordersDB, sql`${ordersDB.customerId} = ${customersDB.id}`)
            .where(and(...filters))
            .groupBy(customersDB.id, customerCashbackAccountsDB.balanceCents)
            .$dynamic();
        },
        orderBy,
        page: input.page,
        pageSize: input.pageSize,
        mapRow: (customer) => {
          if (!customer.createdAt) {
            throw new Error("Customer is missing its creation date");
          }

          return {
            ...customer,
            cashbackBalanceCents: Number(customer.cashbackBalanceCents),
            orderCount: Number(customer.orderCount),
            createdAt: customer.createdAt,
          } satisfies CustomerListItem;
        },
      });

      return customers;
    },
  };
}
