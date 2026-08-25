import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import {
  correctionBodySchema,
  metadataBodySchema,
  purchaseOrderDraftBodySchema,
  purchaseOrderListQuerySchema,
  purchaseOrderParamsSchema,
  reasonBodySchema,
  receiptBodySchema,
  receiptParamsSchema,
  supplierCatalogQuerySchema,
  type CorrectionBody,
  type MetadataBody,
  type PurchaseOrderDraftBody,
  type PurchaseOrderListQuery,
  type PurchaseOrderParams,
  type ReasonBody,
  type ReceiptBody,
  type ReceiptParams,
  type SupplierCatalogQuery,
} from "./purchaseOrders.schemas";

export async function adminPurchaseOrdersRoutes(server: FastifyInstance) {
  const canRead = adminAuthHandler({
    roles: ["owner", "admin", "member"],
    permissions: { purchaseOrders: ["read"] },
  });
  const canManage = adminAuthHandler({
    roles: ["owner", "admin"],
    permissions: { purchaseOrders: ["manage"] },
  });
  const canReceive = adminAuthHandler({
    roles: ["owner", "admin"],
    permissions: { purchaseOrders: ["receive"] },
  });
  const context = (request: {
    auth: { user: { id: string }; member: { organizationId: string } };
  }) => ({
    userId: request.auth.user.id,
    organizationId: request.auth.member.organizationId,
  });

  server.get("/options", { preHandler: [canRead] }, async (request, reply) =>
    reply.status(200).send(await server.admin.purchaseOrders.options(context(request))),
  );
  server.get<{ Querystring: SupplierCatalogQuery }>(
    "/catalog",
    { preHandler: [canManage], schema: { querystring: supplierCatalogQuerySchema } },
    async (request, reply) =>
      reply
        .status(200)
        .send(await server.admin.purchaseOrders.catalog({ ...context(request), ...request.query })),
  );
  server.get<{ Querystring: PurchaseOrderListQuery }>(
    "/",
    { preHandler: [canRead], schema: { querystring: purchaseOrderListQuerySchema } },
    async (request, reply) =>
      reply
        .status(200)
        .send(await server.admin.purchaseOrders.list({ ...context(request), ...request.query })),
  );
  server.post<{ Body: PurchaseOrderDraftBody }>(
    "/",
    { preHandler: [canManage], schema: { body: purchaseOrderDraftBodySchema } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await server.admin.purchaseOrders.create({ ...context(request), ...request.body })),
  );
  server.get<{ Params: PurchaseOrderParams }>(
    "/:purchaseOrderId",
    { preHandler: [canRead], schema: { params: purchaseOrderParamsSchema } },
    async (request, reply) =>
      reply
        .status(200)
        .send(await server.admin.purchaseOrders.get({ ...context(request), ...request.params })),
  );
  server.put<{ Params: PurchaseOrderParams; Body: PurchaseOrderDraftBody }>(
    "/:purchaseOrderId",
    {
      preHandler: [canManage],
      schema: { params: purchaseOrderParamsSchema, body: purchaseOrderDraftBodySchema },
    },
    async (request, reply) =>
      reply.status(200).send(
        await server.admin.purchaseOrders.updateDraft({
          ...context(request),
          ...request.params,
          ...request.body,
        }),
      ),
  );
  server.delete<{ Params: PurchaseOrderParams }>(
    "/:purchaseOrderId",
    { preHandler: [canManage], schema: { params: purchaseOrderParamsSchema } },
    async (request, reply) => {
      await server.admin.purchaseOrders.deleteDraft({ ...context(request), ...request.params });
      return reply.status(204).send();
    },
  );
  server.post<{ Params: PurchaseOrderParams }>(
    "/:purchaseOrderId/issue",
    { preHandler: [canManage], schema: { params: purchaseOrderParamsSchema } },
    async (request, reply) =>
      reply
        .status(200)
        .send(await server.admin.purchaseOrders.issue({ ...context(request), ...request.params })),
  );
  server.patch<{ Params: PurchaseOrderParams; Body: MetadataBody }>(
    "/:purchaseOrderId/metadata",
    {
      preHandler: [canManage],
      schema: { params: purchaseOrderParamsSchema, body: metadataBodySchema },
    },
    async (request, reply) =>
      reply.status(200).send(
        await server.admin.purchaseOrders.updateMetadata({
          ...context(request),
          ...request.params,
          ...request.body,
        }),
      ),
  );
  for (const action of ["cancel", "close"] as const) {
    server.post<{ Params: PurchaseOrderParams; Body: ReasonBody }>(
      `/:purchaseOrderId/${action}`,
      {
        preHandler: [canManage],
        schema: { params: purchaseOrderParamsSchema, body: reasonBodySchema },
      },
      async (request, reply) =>
        reply.status(200).send(
          await server.admin.purchaseOrders[action]({
            ...context(request),
            ...request.params,
            ...request.body,
          }),
        ),
    );
  }
  server.post<{ Params: PurchaseOrderParams }>(
    "/:purchaseOrderId/duplicate",
    { preHandler: [canManage], schema: { params: purchaseOrderParamsSchema } },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await server.admin.purchaseOrders.duplicate({ ...context(request), ...request.params }),
        ),
  );
  server.post<{ Params: PurchaseOrderParams; Body: ReceiptBody }>(
    "/:purchaseOrderId/receipts",
    {
      preHandler: [canReceive],
      schema: { params: purchaseOrderParamsSchema, body: receiptBodySchema },
    },
    async (request, reply) =>
      reply.status(201).send(
        await server.admin.purchaseOrders.receive({
          ...context(request),
          ...request.params,
          ...request.body,
        }),
      ),
  );
  server.post<{ Params: ReceiptParams; Body: ReasonBody }>(
    "/:purchaseOrderId/receipts/:receiptId/reverse",
    {
      preHandler: [canReceive],
      schema: { params: receiptParamsSchema, body: reasonBodySchema },
    },
    async (request, reply) =>
      reply.status(200).send(
        await server.admin.purchaseOrders.reverseReceipt({
          ...context(request),
          ...request.params,
          ...request.body,
        }),
      ),
  );
  server.post<{ Params: ReceiptParams; Body: CorrectionBody }>(
    "/:purchaseOrderId/receipts/:receiptId/correct",
    {
      preHandler: [canReceive],
      schema: { params: receiptParamsSchema, body: correctionBodySchema },
    },
    async (request, reply) =>
      reply.status(200).send(
        await server.admin.purchaseOrders.correctReceipt({
          ...context(request),
          ...request.params,
          ...request.body,
        }),
      ),
  );
}
