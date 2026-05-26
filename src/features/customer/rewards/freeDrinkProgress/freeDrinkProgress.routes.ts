import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getFreeDrinkProgress } from "./freeDrinkProgress.controllers";
import { freeDrinkProgressResponseSchema } from "./freeDrinkProgress.schemas";

export async function freeDrinkProgressRoutes(server: FastifyInstance) {
  server.get(
    "/free-drink-progress",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        response: {
          200: freeDrinkProgressResponseSchema,
        },
      },
    },
    getFreeDrinkProgress,
  );
}
