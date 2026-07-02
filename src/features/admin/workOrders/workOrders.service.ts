import { orderItemsDB, productsDB, uploadsDB, workOrdersDB } from "@core/db/schemas";
import { buildFuzzySearch, conflict, notFound, paginate } from "@core/utils";
import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  AdminWorkOrdersService,
  WorkOrderListStatus,
  WorkOrderResponse,
} from "./workOrders.types";

function getDefaultOrderBy(status: WorkOrderListStatus): [SQL, ...SQL[]] {
  if (status === "completed") {
    return [desc(workOrdersDB.completedAt), desc(workOrdersDB.createdAt), desc(workOrdersDB.id)];
  }

  if (status === "all") {
    return [
      sql`case when ${workOrdersDB.status} = 'open' then 0 else 1 end`,
      asc(workOrdersDB.createdAt),
      asc(workOrdersDB.id),
    ];
  }

  return [asc(workOrdersDB.createdAt), asc(workOrdersDB.id)];
}

async function attachProductImages(
  fastify: FastifyInstance,
  workOrders: (typeof workOrdersDB.$inferSelect)[],
): Promise<WorkOrderResponse[]> {
  const orderItemIds = [...new Set(workOrders.map((workOrder) => workOrder.orderItemId))];

  if (orderItemIds.length === 0) {
    return workOrders.map((workOrder) => ({
      ...workOrder,
      productImage: null,
    }));
  }

  const imageRows = await fastify.db
    .select({
      orderItemId: orderItemsDB.id,
      imageId: uploadsDB.id,
      imageName: uploadsDB.name,
      imagePath: uploadsDB.path,
      imageVisibility: uploadsDB.visibility,
      imageMimeType: uploadsDB.mimeType,
    })
    .from(orderItemsDB)
    .innerJoin(productsDB, eq(orderItemsDB.productId, productsDB.id))
    .leftJoin(uploadsDB, eq(productsDB.imageUploadId, uploadsDB.id))
    .where(inArray(orderItemsDB.id, orderItemIds));

  const imagesByOrderItemId = new Map<string, WorkOrderResponse["productImage"]>();

  for (const row of imageRows) {
    imagesByOrderItemId.set(
      row.orderItemId,
      row.imageId
        ? {
            id: row.imageId,
            name: row.imageName ?? "",
            path: row.imagePath ?? "",
            visibility: row.imageVisibility ?? "PUBLIC",
            mimeType: row.imageMimeType ?? "",
          }
        : null,
    );
  }

  return workOrders.map((workOrder) => ({
    ...workOrder,
    productImage: imagesByOrderItemId.get(workOrder.orderItemId) ?? null,
  }));
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
        data: await attachProductImages(fastify, paginatedWorkOrders.data),
      };
    },

    async complete({ organizationId, workOrderId, completedByUserId }) {
      const [completedWorkOrder] = await fastify.db
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

      if (completedWorkOrder) {
        await fastify.db.execute(sql`
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
      }

      const existingWorkOrder = await fastify.db.query.workOrdersDB.findFirst({
        where(table, { and, eq }) {
          return and(eq(table.id, workOrderId), eq(table.organizationId, organizationId));
        },
        columns: {
          id: true,
          status: true,
        },
      });

      if (!existingWorkOrder) {
        throw notFound("workOrder.notFound", "The work order was not found");
      }

      throw conflict("workOrder.alreadyCompleted", "The work order is already completed");
    },
  };
}
