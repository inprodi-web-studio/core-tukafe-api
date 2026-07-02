import type { FastifyInstance } from "fastify";
import { configurationRoutes } from "./configuration";
import { customerOrderCountRoutes } from "./customerOrderCount";
import { favoriteRoutes } from "./favorite";
import { listRoutes } from "./list";
import { popularRoutes } from "./popular";
import { recommendedRoutes } from "./recommended";

export async function customerProductsRoutes(server: FastifyInstance) {
  await server.register(configurationRoutes);
  await server.register(customerOrderCountRoutes);
  await server.register(favoriteRoutes);
  await server.register(popularRoutes);
  await server.register(recommendedRoutes);
  await server.register(listRoutes);
}
