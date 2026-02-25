import type { FastifyInstance } from "fastify";
import { signup } from "./signup.controllers";

export async function signupRoutes(server: FastifyInstance) {
  server.post(
    "/signup",
    {
      schema: {
        // body : "",
        // response : "",
      },
    },
    signup,
  );
}
