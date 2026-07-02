import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getCashbackSummary, listCashbackMovements } from "./cashback.controllers";
import {
  cashbackMovementsQuerySchema,
  cashbackMovementsResponseSchema,
  cashbackSummaryResponseSchema,
  type CashbackMovementsQuery,
} from "./cashback.schemas";

export async function cashbackRoutes(server: FastifyInstance) {
  server.get(
    "/cashback",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        response: {
          200: cashbackSummaryResponseSchema,
        },
      },
    },
    getCashbackSummary,
  );

  server.get<{ Querystring: CashbackMovementsQuery }>(
    "/cashback/movements",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        querystring: cashbackMovementsQuerySchema,
        response: {
          200: cashbackMovementsResponseSchema,
        },
      },
    },
    listCashbackMovements,
  );
}
