import {
  createOrder,
  createOrderPaymentAttempt,
  recordOrderPaymentAttemptResult,
} from "@features/shared/orders/orders.service";
import type { FastifyInstance } from "fastify";
import type { AdminOrdersService } from "./orders.types";

export function adminOrdersService(fastify: FastifyInstance): AdminOrdersService {
  return {
    async create(input) {
      return createOrder(fastify, input);
    },
    async createPaymentAttempt(input) {
      return createOrderPaymentAttempt(fastify, input);
    },
    async recordPaymentAttemptResult(input) {
      return recordOrderPaymentAttemptResult(fastify, input);
    },
  };
}
