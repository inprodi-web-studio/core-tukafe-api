import { apiKeyAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { identifyWithQr } from "./identifyWithQr.controllers";
import {
  identifyWithQrBodySchema,
  identifyWithQrResponseSchema,
  type IdentifyWithQrBody,
} from "./identifyWithQr.schemas";

export async function identifyWithQrRoutes(server: FastifyInstance) {
  server.post<{ Body: IdentifyWithQrBody }>(
    "/identify-with-qr",
    {
      preHandler: [apiKeyAuthHandler()],
      schema: {
        body: identifyWithQrBodySchema,
        response: {
          200: identifyWithQrResponseSchema,
        },
      },
    },
    identifyWithQr,
  );
}
