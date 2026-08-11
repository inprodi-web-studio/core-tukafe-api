import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { listRoutes } from "./list";
import { orderRoutes } from "./order";
import { removeRoutes } from "./remove";
import { updateRoutes } from "./update";

export async function adminProductcategoriesRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);
  await server.register(updateRoutes);
  await server.register(orderRoutes);
  await server.register(removeRoutes);
}
