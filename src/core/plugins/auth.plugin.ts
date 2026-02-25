import { toNodeHandler } from "better-auth/node";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { auth } from "@core/config/auth.config";

declare module "fastify" {
  interface FastifyInstance {
    auth: typeof auth;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const authHandler = toNodeHandler(auth);

  fastify.decorate("auth", auth);

  fastify.route({
    method: ["GET", "POST"],
    url: `/authx/*`,
    handler: async (request, reply) => {
      reply.hijack();

      await authHandler(request.raw, reply.raw);
    },
  });
};

export default fp(authPlugin, {
  name: "auth",
});
