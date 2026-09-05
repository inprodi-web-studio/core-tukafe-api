import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { requireGlobalSupplierManager } from "./suppliers.access";
import {
  assignItemBodySchema,
  costBodySchema,
  costListResponseSchema,
  costSchema,
  createSupplierBodySchema,
  itemListQuerySchema,
  paginationQuerySchema,
  presentationInputSchema,
  presentationParamsSchema,
  presentationSchema,
  supplierItemListResponseSchema,
  supplierItemParamsSchema,
  supplierItemSchema,
  supplierListResponseSchema,
  supplierParamsSchema,
  supplierSchema,
  updateSupplierBodySchema,
  listQuerySchema,
  type AssignItemBody,
  type CostBody,
  type CreateSupplierBody,
  type ItemListQuery,
  type ListQuery,
  type PaginationQuery,
  type PresentationInputBody,
  type PresentationParams,
  type SupplierItemParams,
  type SupplierParams,
  type UpdateSupplierBody,
} from "./suppliers.schemas";

export async function adminSuppliersRoutes(server: FastifyInstance) {
  const canRead = adminAuthHandler({
    roles: ["owner", "admin"],
    permissions: { suppliers: ["read"] },
  });
  const canManage = [adminAuthHandler({ roles: ["owner", "admin"] }), requireGlobalSupplierManager];

  server.get<{ Querystring: ListQuery }>(
    "/",
    {
      preHandler: [canRead],
      schema: { querystring: listQuerySchema, response: { 200: supplierListResponseSchema } },
    },
    async (request, reply) =>
      reply.status(200).send(await server.admin.suppliers.list(request.query)),
  );

  server.post<{ Body: CreateSupplierBody }>(
    "/",
    {
      preHandler: canManage,
      schema: { body: createSupplierBodySchema, response: { 201: supplierSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await server.admin.suppliers.create(request.body)),
  );

  server.get<{ Params: SupplierParams }>(
    "/:supplierId",
    {
      preHandler: [canRead],
      schema: { params: supplierParamsSchema, response: { 200: supplierSchema } },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await server.admin.suppliers.get(request.params.supplierId, { includeInactive: true }),
        ),
  );

  server.patch<{ Params: SupplierParams; Body: UpdateSupplierBody }>(
    "/:supplierId",
    {
      preHandler: canManage,
      schema: {
        params: supplierParamsSchema,
        body: updateSupplierBodySchema,
        response: { 200: supplierSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(await server.admin.suppliers.update(request.params.supplierId, request.body)),
  );

  server.delete<{ Params: SupplierParams }>(
    "/:supplierId",
    {
      preHandler: canManage,
      schema: { params: supplierParamsSchema },
    },
    async (request, reply) => {
      await server.admin.suppliers.deactivate(request.params.supplierId);
      return reply.status(204).send();
    },
  );

  server.put<{ Params: SupplierParams }>(
    "/:supplierId/restore",
    {
      preHandler: canManage,
      schema: { params: supplierParamsSchema, response: { 200: supplierSchema } },
    },
    async (request, reply) =>
      reply.status(200).send(await server.admin.suppliers.restore(request.params.supplierId)),
  );

  server.get<{ Params: SupplierParams; Querystring: ItemListQuery }>(
    "/:supplierId/items",
    {
      preHandler: [canRead],
      schema: {
        params: supplierParamsSchema,
        querystring: itemListQuerySchema,
        response: { 200: supplierItemListResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(await server.admin.suppliers.listItems(request.params.supplierId, request.query)),
  );

  server.post<{ Params: SupplierParams; Body: AssignItemBody }>(
    "/:supplierId/items",
    {
      preHandler: canManage,
      schema: {
        params: supplierParamsSchema,
        body: assignItemBodySchema,
        response: { 201: supplierItemSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await server.admin.suppliers.assignItem(
            request.params.supplierId,
            request.body,
            request.auth.user.id,
          ),
        ),
  );

  server.delete<{ Params: SupplierItemParams }>(
    "/:supplierId/items/:supplierItemId",
    {
      preHandler: canManage,
      schema: { params: supplierItemParamsSchema },
    },
    async (request, reply) => {
      await server.admin.suppliers.deactivateItem(
        request.params.supplierId,
        request.params.supplierItemId,
      );
      return reply.status(204).send();
    },
  );

  server.put<{ Params: SupplierItemParams }>(
    "/:supplierId/items/:supplierItemId/restore",
    {
      preHandler: canManage,
      schema: { params: supplierItemParamsSchema, response: { 200: supplierItemSchema } },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await server.admin.suppliers.restoreItem(
            request.params.supplierId,
            request.params.supplierItemId,
          ),
        ),
  );

  server.post<{ Params: SupplierItemParams; Body: PresentationInputBody }>(
    "/:supplierId/items/:supplierItemId/presentations",
    {
      preHandler: canManage,
      schema: {
        params: supplierItemParamsSchema,
        body: presentationInputSchema,
        response: { 201: presentationSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await server.admin.suppliers.createPresentation(
            request.params.supplierId,
            request.params.supplierItemId,
            request.body,
            request.auth.user.id,
          ),
        ),
  );

  server.delete<{ Params: PresentationParams }>(
    "/:supplierId/items/:supplierItemId/presentations/:presentationId",
    {
      preHandler: canManage,
      schema: { params: presentationParamsSchema },
    },
    async (request, reply) => {
      await server.admin.suppliers.deactivatePresentation(
        request.params.supplierId,
        request.params.supplierItemId,
        request.params.presentationId,
      );
      return reply.status(204).send();
    },
  );

  server.put<{ Params: PresentationParams }>(
    "/:supplierId/items/:supplierItemId/presentations/:presentationId/restore",
    {
      preHandler: canManage,
      schema: { params: presentationParamsSchema, response: { 200: presentationSchema } },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await server.admin.suppliers.restorePresentation(
            request.params.supplierId,
            request.params.supplierItemId,
            request.params.presentationId,
          ),
        ),
  );

  server.put<{ Params: PresentationParams }>(
    "/:supplierId/items/:supplierItemId/presentations/:presentationId/default",
    {
      preHandler: canManage,
      schema: { params: presentationParamsSchema, response: { 200: presentationSchema } },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await server.admin.suppliers.setDefaultPresentation(
            request.params.supplierId,
            request.params.supplierItemId,
            request.params.presentationId,
          ),
        ),
  );

  server.post<{ Params: PresentationParams; Body: CostBody }>(
    "/:supplierId/items/:supplierItemId/presentations/:presentationId/costs",
    {
      preHandler: canManage,
      schema: {
        params: presentationParamsSchema,
        body: costBodySchema,
        response: { 201: costSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await server.admin.suppliers.addCost(
            request.params.supplierId,
            request.params.supplierItemId,
            request.params.presentationId,
            request.body,
            request.auth.user.id,
          ),
        ),
  );

  server.get<{ Params: PresentationParams; Querystring: PaginationQuery }>(
    "/:supplierId/items/:supplierItemId/presentations/:presentationId/costs",
    {
      preHandler: [canRead],
      schema: {
        params: presentationParamsSchema,
        querystring: paginationQuerySchema,
        response: { 200: costListResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await server.admin.suppliers.listCosts(
            request.params.supplierId,
            request.params.supplierItemId,
            request.params.presentationId,
            request.query,
          ),
        ),
  );
}
