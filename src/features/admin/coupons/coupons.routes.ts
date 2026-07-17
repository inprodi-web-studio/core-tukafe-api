import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { getByIdRoutes } from "./getById";
import { listRoutes } from "./list";
import { ruleOptionsRoutes } from "./ruleOptions";
import { updateRoutes } from "./update";
import { updateStatusRoutes } from "./updateStatus";

export async function adminCouponsRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);
  await server.register(ruleOptionsRoutes);
  await server.register(getByIdRoutes);
  await server.register(updateRoutes);
  await server.register(updateStatusRoutes);
}
