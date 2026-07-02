import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { updateLocation } from "./updateLocation.controllers";
import {
  paramsSchema,
  type Params,
  updateLocationBodySchema,
  type UpdateLocationBody,
  updateLocationResponseSchema,
} from "./updateLocation.schemas";

export async function updateLocationRoutes(server: FastifyInstance) {
  server.patch<{
    Params: Params;
    Body: UpdateLocationBody;
  }>(
    "/:organizationId/location",
    {
      preHandler: [adminAuthHandler({ permissions: { organization: ["update"] } })],
      schema: {
        params: paramsSchema,
        body: updateLocationBodySchema,
        response: {
          200: updateLocationResponseSchema,
        },
      },
    },
    updateLocation,
  );
}
