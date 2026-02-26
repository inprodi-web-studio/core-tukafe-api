import type { FastifyInstance } from "fastify";
import { loginWithEmailOrPhone } from "./login.controllers";
import { loginBodySchema, loginResponseSchema } from "./login.schemas";

export async function loginRoutes(server: FastifyInstance) {
  server.post(
    "/",
    {
      schema: {
        body: loginBodySchema,
        response: {
          200: loginResponseSchema,
        },
      },
    },
    loginWithEmailOrPhone,
  );
}
