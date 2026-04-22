import type { FastifyInstance } from "fastify";
import { listRoutes } from "./list";

export async function guestProductCategoriesRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
}
