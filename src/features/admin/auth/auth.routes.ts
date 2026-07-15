import type { FastifyInstance } from "fastify";
import { loginRoutes } from "./login";
import { portalRoutes } from "./portal";

export async function adminAuthRoutes(server: FastifyInstance) {
  await server.register(loginRoutes, { prefix: "/login" });
  await server.register(portalRoutes, { prefix: "/portal" });
}
