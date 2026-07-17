import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { listRuleOptions } from "./ruleOptions.controllers";
import { querySchema, responseSchema, type Query } from "./ruleOptions.schemas";

export async function ruleOptionsRoutes(server: FastifyInstance) {
  server.get<{ Querystring: Query }>(
    "/rule-options",
    {
      preHandler: [
        adminAuthHandler({ roles: ["owner", "admin"], permissions: { coupons: ["read"] } }),
      ],
      schema: {
        querystring: querySchema,
        response: { 200: responseSchema },
      },
    },
    listRuleOptions,
  );
}
