import type { FastifyInstance } from "fastify";
import { configurationRoutes } from "./configuration";
import { customerOrderCountRoutes } from "./customerOrderCount";
import { listRoutes } from "./list";

export async function customerProductsRoutes(server: FastifyInstance) {
  await server.register(configurationRoutes);
  await server.register(customerOrderCountRoutes);
  await server.register(listRoutes);
}
