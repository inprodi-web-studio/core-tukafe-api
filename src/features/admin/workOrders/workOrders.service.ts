import {
  orderItemCompoundComponentsDB,
  orderItemsDB,
  notificationOutboxDB,
  ordersDB,
  organizationDB,
  productsDB,
  uploadsDB,
  workOrdersDB,
} from "@core/db/schemas";
import { buildFuzzySearch, conflict, generateNanoId, notFound, paginate } from "@core/utils";
import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { consumeWorkOrderInventory } from "@features/shared/inventory";
import type {
  AdminWorkOrdersService,
  WorkOrderListStatus,
  WorkOrderResponse,
} from "./workOrders.types";

export function shouldEnqueueOrderReadyNotification({
  source,
  customerId,
  hasRemainingWorkOrders,
}: {
  source: string;
  customerId: string | null;
  hasRemainingWorkOrders: boolean;
}) {
  return source === "mobile" && customerId !== null && !hasRemainingWorkOrders;
}

function getDefaultOrderBy(status: WorkOrderListStatus): [SQL, ...SQL[]] {
  if (status === "completed") {
    return [desc(workOrdersDB.completedAt), desc(workOrdersDB.createdAt), desc(workOrdersDB.id)];
  }

  if (status === "all") {
    return [
      sql`case when ${workOrdersDB.status} = 'open' then 0 else 1 end`,
      sql`case when ${workOrdersDB.scheduledFor} is null then 0 else 1 end`,
      asc(workOrdersDB.scheduledFor),
      asc(workOrdersDB.createdAt),
      asc(workOrdersDB.id),
    ];
  }

  return [
    sql`case when ${workOrdersDB.scheduledFor} is null then 0 else 1 end`,
    asc(workOrdersDB.scheduledFor),
    asc(workOrdersDB.createdAt),
    asc(workOrdersDB.id),
  ];
}

export async function attachWorkOrderDetails(
  fastify: FastifyInstance,
  workOrders: (typeof workOrdersDB.$inferSelect)[],
): Promise<WorkOrderResponse[]> {
  const orderItemIds = [...new Set(workOrders.map((workOrder) => workOrder.orderItemId))];

  if (orderItemIds.length === 0) {
    return workOrders.map((workOrder) => ({
      ...workOrder,
      comboName: null,
      productImage: null,
    }));
  }

  const imageRows = await fastify.db
    .select({
      comboName: orderItemsDB.productName,
      componentProductKitchenName: orderItemCompoundComponentsDB.productKitchenName,
      componentProductName: orderItemCompoundComponentsDB.productName,
      orderItemId: orderItemsDB.id,
      imageId: uploadsDB.id,
      imageName: uploadsDB.name,
      imagePath: uploadsDB.path,
      imageVisibility: uploadsDB.visibility,
      imageMimeType: uploadsDB.mimeType,
    })
    .from(orderItemsDB)
    .leftJoin(
      orderItemCompoundComponentsDB,
      eq(orderItemsDB.id, orderItemCompoundComponentsDB.orderItemId),
    )
    .innerJoin(
      productsDB,
      eq(
        sql`coalesce(${orderItemCompoundComponentsDB.componentProductId}, ${orderItemsDB.productId})`,
        productsDB.id,
      ),
    )
    .leftJoin(uploadsDB, eq(productsDB.imageUploadId, uploadsDB.id))
    .where(inArray(orderItemsDB.id, orderItemIds));

  const detailsByWorkOrderKey = new Map<
    string,
    {
      comboName: string | null;
      productImage: WorkOrderResponse["productImage"];
    }
  >();

  for (const row of imageRows) {
    const key = row.componentProductName
      ? [row.orderItemId, row.componentProductName, row.componentProductKitchenName ?? ""].join(":")
      : row.orderItemId;
    detailsByWorkOrderKey.set(key, {
      comboName: row.componentProductName ? row.comboName : null,
      productImage: row.imageId
        ? {
            id: row.imageId,
            name: row.imageName ?? "",
            path: row.imagePath ?? "",
            visibility: row.imageVisibility ?? "PUBLIC",
            mimeType: row.imageMimeType ?? "",
          }
        : null,
    });
  }

  return workOrders.map((workOrder) => {
    const componentKey = [
      workOrder.orderItemId,
      workOrder.productName,
      workOrder.productKitchenName ?? "",
    ].join(":");
    const details =
      detailsByWorkOrderKey.get(componentKey) ?? detailsByWorkOrderKey.get(workOrder.orderItemId);

    return {
      ...workOrder,
      comboName: details?.comboName ?? null,
      productImage: details?.productImage ?? null,
    };
  });
}

export function adminWorkOrdersService(fastify: FastifyInstance): AdminWorkOrdersService {
  return {
    async list({ organizationId, status = "open", search, page, pageSize }) {
      const defaultOrderBy = getDefaultOrderBy(status);
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [
          workOrdersDB.orderFolio,
          workOrdersDB.customerDisplayName,
          workOrdersDB.productName,
          workOrdersDB.productKitchenName,
          workOrdersDB.variationName,
        ],
        tieBreakers: defaultOrderBy,
      });

      const paginatedWorkOrders = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const filters = [eq(workOrdersDB.organizationId, organizationId)];
          const query = fastify.db.select().from(workOrdersDB).$dynamic();

          if (status !== "all") {
            filters.push(eq(workOrdersDB.status, status));
          }

          if (fuzzySearch.where) {
            filters.push(fuzzySearch.where);
          }

          query.where(and(...filters));

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });

      return {
        ...paginatedWorkOrders,
        data: await attachWorkOrderDetails(fastify, paginatedWorkOrders.data),
      };
    },

    async complete({ organizationId, workOrderId, completedByUserId }) {
      return fastify.db.transaction(async (tx) => {
        const existingWorkOrder = await tx.query.workOrdersDB.findFirst({
          where(table, { and: andOperator, eq: eqOperator }) {
            return andOperator(
              eqOperator(table.id, workOrderId),
              eqOperator(table.organizationId, organizationId),
            );
          },
        });

        if (!existingWorkOrder) {
          throw notFound("workOrder.notFound", "The work order was not found");
        }

        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${existingWorkOrder.orderId}, 0))`,
        );

        const [completedWorkOrder] = await tx
          .update(workOrdersDB)
          .set({
            status: "completed",
            completedAt: sql`now()`,
            completedByUserId,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(workOrdersDB.id, workOrderId),
              eq(workOrdersDB.organizationId, organizationId),
              eq(workOrdersDB.status, "open"),
            ),
          )
          .returning();

        if (!completedWorkOrder) {
          throw conflict("workOrder.alreadyCompleted", "The work order is already completed");
        }

        await consumeWorkOrderInventory(tx, {
          workOrderId: completedWorkOrder.id,
          actorUserId: completedByUserId,
        });

        const remainingWorkOrder = await tx.query.workOrdersDB.findFirst({
          where(table, { and: andOperator, eq: eqOperator }) {
            return andOperator(
              eqOperator(table.orderId, completedWorkOrder.orderId),
              eqOperator(table.status, "open"),
            );
          },
          columns: { id: true },
        });

        if (!remainingWorkOrder) {
          const [order] = await tx
            .select({
              id: ordersDB.id,
              customerId: ordersDB.customerId,
              source: ordersDB.source,
              folio: ordersDB.folio,
              organizationName: organizationDB.name,
            })
            .from(ordersDB)
            .innerJoin(organizationDB, eq(ordersDB.organizationId, organizationDB.id))
            .where(eq(ordersDB.id, completedWorkOrder.orderId))
            .limit(1);

          if (
            order &&
            shouldEnqueueOrderReadyNotification({
              source: order.source,
              customerId: order.customerId,
              hasRemainingWorkOrders: false,
            })
          ) {
            await tx
              .insert(notificationOutboxDB)
              .values({
                id: generateNanoId(),
                dedupeKey: `order.ready:${order.id}`,
                eventType: "order.ready",
                customerId: order.customerId!,
                orderId: order.id,
                title: "¡Tu pedido está listo!",
                body: `Tu pedido ${order.folio} en ${order.organizationName} ya está listo para recoger.`,
                destination: "orders",
              })
              .onConflictDoNothing({ target: notificationOutboxDB.dedupeKey });
          }
        }

        await tx.execute(sql`
          select pg_notify(
            'work_order_events',
            json_build_object(
              'type', 'workOrder.completed',
              'organizationId', ${completedWorkOrder.organizationId}::text,
              'workOrderId', ${completedWorkOrder.id}::text
            )::text
          )
        `);

        return completedWorkOrder;
      });
    },
  };
}
