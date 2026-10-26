import type { FastifyInstance } from "fastify";
import { adminAuthHandler } from "@core/handlers";
import { z } from "zod";
import { createRoutes } from "./create";
import { listRoutes } from "./list";
import { orderRoutes } from "./order";
import { removeRoutes } from "./remove";
import { updateRoutes } from "./update";

export async function adminProductcategoriesRoutes(server: FastifyInstance) {
  server.patch<{ Params: { categoryId: string }; Body: { isActive: boolean } }>(
    "/:categoryId/organization-status",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { productCategories: ["update"] },
        }),
      ],
      schema: {
        params: z.object({ categoryId: z.string().min(1) }).strict(),
        body: z.object({ isActive: z.boolean() }).strict(),
      },
    },
    async (request, reply) => {
      await request.server.admin.productCategories.updateOrganizationStatus(
        request.params.categoryId,
        request.auth.member.organizationId,
        request.body.isActive,
      );
      return reply.status(204).send();
    },
  );
  await server.register(listRoutes);
  await server.register(createRoutes);
  await server.register(updateRoutes);
  await server.register(orderRoutes);
  await server.register(removeRoutes);
}
