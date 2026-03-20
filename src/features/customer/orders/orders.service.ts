import { createOrder } from "@features/shared/orders/orders.service";
import type { FastifyInstance } from "fastify";
import type { CustomerOrdersService } from "./orders.types";

export function customerOrdersService(fastify: FastifyInstance): CustomerOrdersService {
  return {
    async create(input) {
      return createOrder(fastify, input);
    },
  };
}
