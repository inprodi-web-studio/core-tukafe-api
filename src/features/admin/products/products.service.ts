import type { FastifyInstance } from "fastify";
import type { AdminProductsService } from "./products.types";

export function adminProductsService(fastify: FastifyInstance): AdminProductsService {
  return {};
}
