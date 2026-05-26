import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { create } from "./create.controllers";
import { createResponseSchema } from "./create.schemas";

export async function createRoutes(server: FastifyInstance) {
  server.post(
    "/",
    {
      preHandler: [adminAuthHandler({ permissions: { uploads: ["create"] } })],
      schema: {
        consumes: ["multipart/form-data"],
        response: {
          201: createResponseSchema,
        },
      },
    },
    create,
  );
}
