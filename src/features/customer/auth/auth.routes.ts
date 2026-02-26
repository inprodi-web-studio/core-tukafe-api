import type { FastifyInstance } from "fastify";
import { signupRoutes } from "./signup";
import { verificationRoutes } from "./verification";
import { loginRoutes } from "./login";

export async function customerAuthRoutes(server: FastifyInstance) {
  await server.register(signupRoutes, { prefix: "/signup" });
  await server.register(verificationRoutes, { prefix: "/verification" });
  await server.register(loginRoutes, { prefix: "/login" });
}
