import {
  customersDB,
  orderItemsDB,
  orderPaymentAttemptsDB,
  ordersDB,
  workOrdersDB,
} from "@core/db/schemas";
import { notFound, paginate } from "@core/utils";
import { mapOrderResponse } from "@features/shared/orders/orders.mappers";
import {
  createOrder,
  createOrderPaymentAttempt,
  recordOrderPaymentAttemptResult,
} from "@features/shared/orders/orders.service";
import { and, desc, eq, gt, gte, ilike, lt, lte, not, or, type SQL, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { resolveOrderDateRange } from "./orders.period";
import {
  adminOrderDetailSchema,
  type AdminOrderDetail,
  type AdminOrderListItem,
} from "./orders.read.schemas";
import type { AdminOrdersService } from "./orders.types";

type PaymentStatus = AdminOrderListItem["payment"]["status"];
type PreparationStatus = AdminOrderListItem["preparation"]["status"];

export function deriveOrderPaymentStatus({
  amountDueCents,
  hasCompletedPayment,
}: {
  amountDueCents: number;
  hasCompletedPayment: boolean;
}): PaymentStatus {
  if (hasCompletedPayment) return "paid";
  return amountDueCents === 0 ? "not_required" : "not_recorded";
}

export function deriveOrderPreparationStatus({
  total,
  open,
  scheduledFor,
  now = new Date(),
}: {
  total: number;
  open: number;
  scheduledFor: Date | null;
  now?: Date;
}): PreparationStatus {
  if (total === 0) return "no_work";
  if (open === 0) return "ready";
  if (scheduledFor && scheduledFor.getTime() > now.getTime()) return "scheduled";
  return "preparing";
}

function completedPaymentExists() {
  return sql<boolean>`exists (
    select 1
    from ${orderPaymentAttemptsDB} payment_attempt
    where payment_attempt.order_id = ${ordersDB.id}
      and payment_attempt.status = 'completed'
  )`;
}

function totalWorkOrders() {
  return sql<number>`(
    select count(*)::int
    from ${workOrdersDB} order_work
    where order_work.order_id = ${ordersDB.id}
  )`;
}

function openWorkOrders() {
  return sql<number>`(
    select count(*)::int
    from ${workOrdersDB} order_work
    where order_work.order_id = ${ordersDB.id}
      and order_work.status = 'open'
  )`;
}

function capturedCustomerName() {
  return sql<string | null>`(
    select min(nullif(trim(order_work.customer_display_name), ''))
    from ${workOrdersDB} order_work
    where order_work.order_id = ${ordersDB.id}
  )`;
}

function registeredCustomerName() {
  return sql<string | null>`nullif(trim(concat_ws(
    ' ',
    ${customersDB.name},
    ${customersDB.middleName},
    ${customersDB.lastName}
  )), '')`;
}

function customerDisplayName() {
  return sql<string>`coalesce(
    ${registeredCustomerName()},
    ${capturedCustomerName()},
    'Venta de mostrador'
  )`;
}

function latestCompletedPaymentProvider() {
  return sql<"zettle" | "stripe" | null>`(
    select payment_attempt.provider
    from ${orderPaymentAttemptsDB} payment_attempt
    where payment_attempt.order_id = ${ordersDB.id}
      and payment_attempt.status = 'completed'
    order by payment_attempt.created_at desc, payment_attempt.id desc
    limit 1
  )`;
}

function paymentStatusFilter(status: "all" | PaymentStatus): SQL | null {
  if (status === "paid") return completedPaymentExists();
  if (status === "not_required") {
    return and(not(completedPaymentExists()), eq(ordersDB.amountDueCents, 0)) ?? null;
  }
  if (status === "not_recorded") {
    return and(not(completedPaymentExists()), gt(ordersDB.amountDueCents, 0)) ?? null;
  }
  return null;
}

function preparationStatusFilter(status: "all" | PreparationStatus, now: Date): SQL | null {
  const total = totalWorkOrders();
  const open = openWorkOrders();
  if (status === "no_work") return sql`${total} = 0`;
  if (status === "ready") return sql`${total} > 0 and ${open} = 0`;
  if (status === "scheduled") {
    return and(sql`${open} > 0`, gt(ordersDB.scheduledFor, now)) ?? null;
  }
  if (status === "preparing") {
    return (
      and(
        sql`${open} > 0`,
        or(sql`${ordersDB.scheduledFor} is null`, lte(ordersDB.scheduledFor, now)),
      ) ?? null
    );
  }
  return null;
}

function fullCustomerName(customer: {
  name: string | null;
  middleName: string | null;
  lastName: string | null;
}) {
  return [customer.name, customer.middleName, customer.lastName]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
}

function requiredDate(value: Date | null, field: string): Date {
  if (!value) throw new Error(`Order data is missing ${field}`);
  return value;
}

export function adminOrdersService(fastify: FastifyInstance): AdminOrdersService {
  return {
    async list(input) {
      const now = new Date();
      const range = resolveOrderDateRange({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        now,
      });
      const normalizedSearch = input.search?.trim();

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters: SQL[] = [
            eq(ordersDB.organizationId, input.organizationId),
            gte(ordersDB.createdAt, range.startAt),
            lt(ordersDB.createdAt, range.endAt),
          ];
          if (input.source !== "all") filters.push(eq(ordersDB.source, input.source));

          const paymentFilter = paymentStatusFilter(input.paymentStatus);
          if (paymentFilter) filters.push(paymentFilter);
          const preparationFilter = preparationStatusFilter(input.preparationStatus, now);
          if (preparationFilter) filters.push(preparationFilter);

          if (normalizedSearch) {
            const pattern = `%${normalizedSearch}%`;
            const searchFilter = or(
              ilike(ordersDB.folio, pattern),
              ilike(customersDB.name, pattern),
              ilike(customersDB.middleName, pattern),
              ilike(customersDB.lastName, pattern),
              ilike(customersDB.email, pattern),
              ilike(customersDB.phone, pattern),
              ilike(customerDisplayName(), pattern),
            );
            if (searchFilter) filters.push(searchFilter);
          }

          return fastify.db
            .select({
              id: ordersDB.id,
              folio: ordersDB.folio,
              createdAt: ordersDB.createdAt,
              scheduledFor: ordersDB.scheduledFor,
              source: ordersDB.source,
              customerId: customersDB.id,
              customerName: customersDB.name,
              customerMiddleName: customersDB.middleName,
              customerLastName: customersDB.lastName,
              customerEmail: customersDB.email,
              customerPhone: customersDB.phone,
              customerDisplayName: customerDisplayName(),
              itemCount: sql<number>`(
                select count(*)::int
                from ${orderItemsDB} order_item_count
                where order_item_count.order_id = ${ordersDB.id}
              )`,
              subtotalCents: ordersDB.subtotalCents,
              promotionDiscountCents: ordersDB.promotionDiscountCents,
              couponDiscountCents: ordersDB.couponDiscountCents,
              cashbackRedemptionCents: ordersDB.cashbackRedemptionCents,
              amountDueCents: ordersDB.amountDueCents,
              hasCompletedPayment: completedPaymentExists(),
              paymentProvider: latestCompletedPaymentProvider(),
              workOrderTotal: totalWorkOrders(),
              workOrderOpen: openWorkOrders(),
            })
            .from(ordersDB)
            .leftJoin(customersDB, eq(customersDB.id, ordersDB.customerId))
            .where(and(...filters))
            .$dynamic();
        },
        orderBy: [desc(ordersDB.createdAt), desc(ordersDB.id)],
        page: input.page,
        pageSize: input.pageSize,
        mapRow: (row): AdminOrderListItem => {
          const discountCents = row.promotionDiscountCents + row.couponDiscountCents;
          const preparationStatus = deriveOrderPreparationStatus({
            total: row.workOrderTotal,
            open: row.workOrderOpen,
            scheduledFor: row.scheduledFor,
            now,
          });

          return {
            id: row.id,
            folio: row.folio,
            createdAt: requiredDate(row.createdAt, "createdAt"),
            scheduledFor: row.scheduledFor,
            source: row.source,
            customer: row.customerId
              ? {
                  id: row.customerId,
                  name: row.customerName,
                  middleName: row.customerMiddleName,
                  lastName: row.customerLastName,
                  email: row.customerEmail,
                  phoneNumber: row.customerPhone,
                }
              : null,
            customerDisplayName: row.customerDisplayName,
            itemCount: row.itemCount,
            grossSubtotalCents: row.subtotalCents + discountCents,
            promotionDiscountCents: row.promotionDiscountCents,
            couponDiscountCents: row.couponDiscountCents,
            discountCents,
            cashbackRedemptionCents: row.cashbackRedemptionCents,
            amountDueCents: row.amountDueCents,
            payment: {
              status: deriveOrderPaymentStatus({
                amountDueCents: row.amountDueCents,
                hasCompletedPayment: row.hasCompletedPayment,
              }),
              provider: row.paymentProvider,
            },
            preparation: {
              status: preparationStatus,
              total: row.workOrderTotal,
              open: row.workOrderOpen,
              completed: row.workOrderTotal - row.workOrderOpen,
            },
          };
        },
      });
    },

    async get(organizationId, orderId) {
      const order = await fastify.db.query.ordersDB.findFirst({
        where(table, { and: andOperator, eq: eqOperator }) {
          return andOperator(
            eqOperator(table.id, orderId),
            eqOperator(table.organizationId, organizationId),
          );
        },
        with: {
          organization: { columns: { id: true, name: true } },
          customer: {
            columns: {
              id: true,
              userId: true,
              name: true,
              middleName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          paymentAttempts: {
            columns: {
              id: true,
              provider: true,
              status: true,
              reference: true,
              amountCents: true,
              currency: true,
              transactionId: true,
              referenceNumber: true,
              cardBrand: true,
              entryMode: true,
              authorizationCode: true,
              obfuscatedPan: true,
              failureCode: true,
              failureMessage: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy(table, { desc: descOperator }) {
              return [descOperator(table.createdAt), descOperator(table.id)];
            },
          },
          items: {
            with: {
              compoundComponents: true,
              modifiers: true,
              taxes: true,
            },
          },
        },
      });

      if (!order) throw notFound("order.notFound", "The order was not found");

      const workOrders = await fastify.db.query.workOrdersDB.findMany({
        where(table, { eq: eqOperator }) {
          return eqOperator(table.orderId, orderId);
        },
        with: {
          completedByUser: { columns: { id: true, name: true, email: true } },
        },
        orderBy(table, { asc: ascOperator }) {
          return [
            ascOperator(table.createdAt),
            ascOperator(table.unitIndex),
            ascOperator(table.id),
          ];
        },
      });

      const { organization, paymentAttempts, ...orderWithRelations } = order;
      const mapped = mapOrderResponse({ ...orderWithRelations, paymentAttempts: [] });
      const completedPayment = paymentAttempts.find((payment) => payment.status === "completed");
      const openWorkOrderCount = workOrders.filter(
        (workOrder) => workOrder.status === "open",
      ).length;
      const preparationStatus = deriveOrderPreparationStatus({
        total: workOrders.length,
        open: openWorkOrderCount,
        scheduledFor: order.scheduledFor,
      });
      const registeredName = order.customer ? fullCustomerName(order.customer) : "";
      const capturedName = workOrders.find((workOrder) =>
        workOrder.customerDisplayName?.trim(),
      )?.customerDisplayName;
      const discountCents = order.promotionDiscountCents + order.couponDiscountCents;

      return adminOrderDetailSchema.parse({
        id: order.id,
        organization,
        folio: order.folio,
        createdAt: requiredDate(order.createdAt, "createdAt"),
        updatedAt: requiredDate(order.updatedAt, "updatedAt"),
        scheduledFor: order.scheduledFor,
        source: order.source,
        comment: order.comment,
        couponCode: order.couponCode,
        customer: mapped.customer,
        customerDisplayName: registeredName || capturedName?.trim() || "Venta de mostrador",
        economics: {
          grossSubtotalCents: order.subtotalCents + discountCents,
          netSubtotalCents: order.subtotalCents,
          promotionDiscountCents: order.promotionDiscountCents,
          couponDiscountCents: order.couponDiscountCents,
          discountCents,
          taxesCents: order.taxesCents,
          tipCents: order.tipCents,
          grandTotalCents: order.grandTotalCents,
          cashbackRedemptionCents: order.cashbackRedemptionCents,
          cashbackEarnedCents: order.cashbackEarnedCents,
          amountDueCents: order.amountDueCents,
        },
        payment: {
          status: deriveOrderPaymentStatus({
            amountDueCents: order.amountDueCents,
            hasCompletedPayment: Boolean(completedPayment),
          }),
          provider: completedPayment ? (completedPayment.provider as "zettle" | "stripe") : null,
        },
        payments: paymentAttempts.map((payment) => ({
          ...payment,
          provider: payment.provider as "zettle" | "stripe",
          status: payment.status as AdminOrderDetail["payments"][number]["status"],
          createdAt: requiredDate(payment.createdAt, "payment.createdAt"),
          updatedAt: requiredDate(payment.updatedAt, "payment.updatedAt"),
        })),
        preparation: {
          status: preparationStatus,
          total: workOrders.length,
          open: openWorkOrderCount,
          completed: workOrders.length - openWorkOrderCount,
        },
        items: mapped.items,
        workOrders: workOrders.map((workOrder) => ({
          id: workOrder.id,
          orderItemId: workOrder.orderItemId,
          productName: workOrder.productName,
          productKitchenName: workOrder.productKitchenName,
          variationName: workOrder.variationName,
          variationSelectionsSnapshot: workOrder.variationSelectionsSnapshot,
          modifiersSnapshot: workOrder.modifiersSnapshot,
          orderComment: workOrder.orderComment,
          itemComment: workOrder.itemComment,
          unitIndex: workOrder.unitIndex,
          quantitySnapshot: workOrder.quantitySnapshot,
          status: workOrder.status,
          scheduledFor: workOrder.scheduledFor,
          completedAt: workOrder.completedAt,
          completedBy: workOrder.completedByUser,
          createdAt: requiredDate(workOrder.createdAt, "workOrder.createdAt"),
        })),
      });
    },

    async create(input) {
      return createOrder(fastify, input, { source: "admin" });
    },
    async createPaymentAttempt(input) {
      return createOrderPaymentAttempt(fastify, input);
    },
    async recordPaymentAttemptResult(input) {
      return recordOrderPaymentAttemptResult(fastify, input);
    },
  };
}
