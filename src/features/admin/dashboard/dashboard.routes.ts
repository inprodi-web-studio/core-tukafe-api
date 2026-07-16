import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getDashboard } from "./dashboard.controllers";
import {
  dashboardQuerySchema,
  dashboardResponseSchema,
  type DashboardQuery,
} from "./dashboard.schemas";

export async function adminDashboardRoutes(server: FastifyInstance) {
  server.get<{ Querystring: DashboardQuery }>(
    "/",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { orders: ["read"] },
        }),
      ],
      schema: {
        querystring: dashboardQuerySchema,
        response: { 200: dashboardResponseSchema },
      },
    },
    getDashboard,
  );
}
