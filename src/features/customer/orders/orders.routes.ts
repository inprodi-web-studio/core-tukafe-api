import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { detailRoutes } from "./detail";
import { listRoutes } from "./list";
import { paymentSheetRoutes } from "./paymentSheet";
import { previewRoutes } from "./preview";

export async function customerOrdersRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(previewRoutes, { prefix: "/preview" });
  await server.register(paymentSheetRoutes);
  await server.register(createRoutes);
  await server.register(detailRoutes);
}
