import type { FastifyInstance } from "fastify";
import { signupWithPhone } from "./signup.controllers";
import { signupWithPhoneBodySchema, signupWithPhoneResponseSchema } from "./signup.schemas";

export async function signupRoutes(server: FastifyInstance) {
  server.post(
    "/email",
    {
      schema: {
        body: signupWithPhoneBodySchema,
        response: {
          201: signupWithPhoneResponseSchema,
        },
      },
    },
    signupWithPhone,
  );
}
