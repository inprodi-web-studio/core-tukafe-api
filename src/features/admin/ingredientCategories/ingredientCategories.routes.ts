import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { listRoutes } from "./list";

export async function adminIngredientCategoriesRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);
}
