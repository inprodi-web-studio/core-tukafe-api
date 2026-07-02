import type { FastifyInstance } from "fastify";
import { meRoutes } from "./me";
import { passwordRoutes } from "./password";
import { signupRoutes } from "./signup";
import { verificationRoutes } from "./verification";
import { loginRoutes } from "./login";

export async function customerAuthRoutes(server: FastifyInstance) {
  await server.register(signupRoutes, { prefix: "/signup" });
  await server.register(verificationRoutes, { prefix: "/verification" });
  await server.register(loginRoutes, { prefix: "/login" });
  await server.register(meRoutes, { prefix: "/me" });
  await server.register(passwordRoutes, { prefix: "/password" });
}
