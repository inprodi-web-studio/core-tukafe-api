import type { FastifyInstance } from "fastify";
import { signupRoutes } from "./signup";

export async function customerAuthRoutes(server: FastifyInstance) {
  await server.register(signupRoutes, { prefix: "/signup" });
}
