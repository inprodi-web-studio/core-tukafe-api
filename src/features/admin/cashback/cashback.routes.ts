import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { createCashbackAdjustment, listCashbackMovements } from "./cashback.controllers";
import {
  adjustmentResponseSchema,
  createAdjustmentBodySchema,
  listQuerySchema,
  listResponseSchema,
  type CashbackListQuery,
  type CreateCashbackAdjustmentBody,
} from "./cashback.schemas";

export async function adminCashbackRoutes(server: FastifyInstance) {
  server.get<{ Querystring: CashbackListQuery }>(
    "/movements",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { cashback: ["read"] },
        }),
      ],
      schema: {
        querystring: listQuerySchema,
        response: { 200: listResponseSchema },
      },
    },
    listCashbackMovements,
  );

  server.post<{ Body: CreateCashbackAdjustmentBody }>(
    "/adjustments",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { cashback: ["update"] },
        }),
      ],
      schema: {
        body: createAdjustmentBodySchema,
        response: { 201: adjustmentResponseSchema },
      },
    },
    createCashbackAdjustment,
  );
}
