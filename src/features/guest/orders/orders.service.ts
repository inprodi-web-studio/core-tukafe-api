import { customersDB } from "@core/db/schemas";
import { normalizePresets, normalizeString } from "@core/utils";
import {
  createOrder,
  createOrderPaymentAttempt,
  previewOrder,
  recordOrderPaymentAttemptResult,
} from "@features/shared/orders/orders.service";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { GuestOrdersService } from "./orders.types";

export function guestOrdersService(fastify: FastifyInstance): GuestOrdersService {
  return {
    async preview(input) {
      return previewOrder(fastify, input);
    },

    async createPaymentAttempt(input) {
      return createOrderPaymentAttempt(fastify, input);
    },

    async recordPaymentAttemptResult(input) {
      return recordOrderPaymentAttemptResult(fastify, input);
    },

    async create(input) {
      const normalizedCustomerName = normalizeString(input.customerName, {
        ...normalizePresets.personName,
        maxLength: 120,
      });

      if (input.customerId && normalizedCustomerName !== "") {
        await fastify.db
          .update(customersDB)
          .set({ name: normalizedCustomerName })
          .where(
            and(
              eq(customersDB.id, input.customerId),
              isNull(customersDB.deletedAt),
              sql`(${customersDB.name} is null or btrim(${customersDB.name}) = '')`,
            ),
          );
      }

      const createOrderInput = {
        organizationId: input.organizationId,
        customerId: input.customerId,
        customerName: normalizedCustomerName || null,
        paymentAttemptId: input.paymentAttemptId,
        couponCode: input.couponCode,
        comment: input.comment,
        tip: input.tip,
        items: input.items,
      };
      return createOrder(fastify, createOrderInput, {
        requirePaymentForPositiveAmountDue: true,
      });
    },
  };
}
