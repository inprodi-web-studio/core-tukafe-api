import type { FastifyInstance } from "fastify";
import { loginRoutes } from "./login";

export async function adminAuthRoutes(server: FastifyInstance) {
  await server.register(loginRoutes, { prefix: "/login" });
}
