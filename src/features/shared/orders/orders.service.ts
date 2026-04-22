import { orderItemModifiersDB, orderItemsDB, orderItemTaxesDB, ordersDB } from "@core/db/schemas";
import { conflict, generateNanoId, getPgError, notFound, validation } from "@core/utils";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildOrderFolioPrefix, formatOrderFolio, normalizeCreateOrderInput } from "./orders.helpers";
import { mapOrderResponse } from "./orders.mappers";
import type { CreateOrderParams, OrderResponse } from "./orders.types";
import {
  buildOrderValidationContext,
  validateAndPrepareOrderPayload,
  validateOrderCustomer,
  validateOrderOrganization,
} from "./orders.validators";

const FOLIO_MAX_SEQUENCE = 999999;
const MAX_FOLIO_RETRY_ATTEMPTS = 5;
const ORDER_FOLIO_UNIQUE_CONSTRAINT = "order_organization_folio_unique";

async function loadOrder(
  fastify: FastifyInstance,
  id: string,
  safe = false,
): Promise<OrderResponse | null> {
  const order = await fastify.db.query.ordersDB.findFirst({
    where(table, { eq: eqOperator }) {
      return eqOperator(table.id, id);
    },
    with: {
      customer: {
        columns: {
          id: true,
          userId: true,
          name: true,
          middleName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      items: {
        with: {
          modifiers: true,
          taxes: true,
        },
      },
    },
  });

  if (!order && !safe) {
    throw notFound("order.notFound", "The order was not found");
  }

  if (!order) {
    return null;
  }

  return mapOrderResponse(order);
}

export async function createOrder(
  fastify: FastifyInstance,
  input: CreateOrderParams,
): Promise<OrderResponse> {
  const normalizedInput = normalizeCreateOrderInput(input);

  await Promise.all([
    validateOrderOrganization(fastify, normalizedInput.organizationId),
    validateOrderCustomer(fastify, normalizedInput.customerId),
  ]);

  const validationContext = await buildOrderValidationContext(
    fastify,
    normalizedInput.organizationId,
    normalizedInput.items,
  );
  const preparedOrderPayload = validateAndPrepareOrderPayload(
    normalizedInput.items,
    validationContext,
  );

  let createdOrderId: string | null = null;

  for (let attempt = 0; attempt < MAX_FOLIO_RETRY_ATTEMPTS; attempt += 1) {
    try {
      createdOrderId = await fastify.db.transaction(async (tx) => {
        const folioPrefix = buildOrderFolioPrefix(new Date());
        const [nextFolioRow] = await tx
          .select({
            nextSequence:
              sql<number>`coalesce(max(substring(${ordersDB.folio} from 7)::integer), 0) + 1`,
          })
          .from(ordersDB)
          .where(
            and(
              eq(ordersDB.organizationId, normalizedInput.organizationId),
              sql`${ordersDB.folio} like ${`${folioPrefix}-%`}`,
            ),
          );

        const nextSequence = nextFolioRow?.nextSequence ?? 1;

        if (nextSequence > FOLIO_MAX_SEQUENCE) {
          throw validation("order.folioLimitReached", `Folio limit reached for period ${folioPrefix}`);
        }

        const orderId = generateNanoId();
        const folio = formatOrderFolio(folioPrefix, nextSequence);

        const [createdOrder] = await tx
          .insert(ordersDB)
          .values({
            id: orderId,
            organizationId: normalizedInput.organizationId,
            customerId: normalizedInput.customerId,
            folio,
            comment: normalizedInput.comment,
            subtotalCents: preparedOrderPayload.subtotalCents,
            taxesCents: preparedOrderPayload.taxesCents,
            grandTotalCents: preparedOrderPayload.grandTotalCents,
          })
          .returning({
            id: ordersDB.id,
          });

        if (!createdOrder) {
          throw new Error("Failed to create order");
        }

        const orderItemsToInsert = preparedOrderPayload.items.map((preparedOrderItem) => ({
          ...preparedOrderItem.item,
          orderId,
        }));

        const orderItemModifiersToInsert = preparedOrderPayload.items.flatMap(
          (preparedOrderItem) => preparedOrderItem.modifiers,
        );
        const orderItemTaxesToInsert = preparedOrderPayload.items.flatMap(
          (preparedOrderItem) => preparedOrderItem.taxes,
        );

        if (orderItemsToInsert.length > 0) {
          await tx.insert(orderItemsDB).values(orderItemsToInsert);
        }

        if (orderItemModifiersToInsert.length > 0) {
          await tx.insert(orderItemModifiersDB).values(orderItemModifiersToInsert);
        }

        if (orderItemTaxesToInsert.length > 0) {
          await tx.insert(orderItemTaxesDB).values(orderItemTaxesToInsert);
        }

        return createdOrder.id;
      });

      break;
    } catch (error) {
      const pgError = getPgError(error);
      const isFolioConflict =
        pgError?.code === "23505" && pgError.constraint === ORDER_FOLIO_UNIQUE_CONSTRAINT;

      if (isFolioConflict && attempt < MAX_FOLIO_RETRY_ATTEMPTS - 1) {
        continue;
      }

      if (isFolioConflict) {
        throw conflict("order.folioConflict", "Failed to generate a unique folio for the order");
      }

      throw error;
    }
  }

  if (!createdOrderId) {
    throw new Error("Failed to create order");
  }

  const createdOrder = await loadOrder(fastify, createdOrderId);

  if (!createdOrder) {
    throw new Error("Failed to retrieve created order");
  }

  return createdOrder;
}
