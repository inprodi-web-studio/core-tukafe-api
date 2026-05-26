import { createOrder, previewOrder } from "@features/shared/orders/orders.service";
import type { FastifyInstance } from "fastify";
import type { CustomerOrdersService } from "./orders.types";

export function customerOrdersService(fastify: FastifyInstance): CustomerOrdersService {
  return {
    async preview(input) {
      return previewOrder(fastify, input);
    },
    async create(input) {
      return createOrder(fastify, input);
    },
  };
}
