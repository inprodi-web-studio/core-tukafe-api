import type { FastifyInstance } from "fastify";
import { loginWithEmail } from "./login.controllers";
import { loginWithEmailBodySchema } from "./login.schemas";

export async function loginRoutes(server: FastifyInstance) {
  server.post(
    "/email",
    {
      schema: {
        body: loginWithEmailBodySchema,
        // response: {
        //   200: loginResponseSchema,
        // },
      },
    },
    loginWithEmail,
  );
}
