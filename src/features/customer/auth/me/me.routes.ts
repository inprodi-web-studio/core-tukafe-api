import { customerAuthHandler } from "@core/handlers";
import { successResponseSchema } from "@core/utils";
import type { FastifyInstance } from "fastify";
import {
  closeCurrentCustomer,
  createCurrentCustomerQrLoginToken,
  getCurrentCustomer,
  updateCurrentCustomer,
} from "./me.controllers";
import {
  currentCustomerResponseSchema,
  qrLoginTokenResponseSchema,
  updateCurrentCustomerBodySchema,
  type UpdateCurrentCustomerBody,
} from "./me.schemas";

export async function meRoutes(server: FastifyInstance) {
  server.get(
    "/",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        response: {
          200: currentCustomerResponseSchema,
        },
      },
    },
    getCurrentCustomer,
  );

  server.patch<{ Body: UpdateCurrentCustomerBody }>(
    "/",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        body: updateCurrentCustomerBodySchema,
        response: {
          200: currentCustomerResponseSchema,
        },
      },
    },
    updateCurrentCustomer,
  );

  server.delete(
    "/",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        response: {
          200: successResponseSchema,
        },
      },
    },
    closeCurrentCustomer,
  );

  server.post(
    "/qr-login-token",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        response: {
          200: qrLoginTokenResponseSchema,
        },
      },
    },
    createCurrentCustomerQrLoginToken,
  );
}
