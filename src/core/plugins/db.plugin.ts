import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { db, pool } from "@core/db";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
    pg: typeof pool;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("db", db);
  fastify.decorate("pg", pool);

  fastify.addHook("onClose", async (instance) => {
    await instance.pg.end();
  });

  fastify.log.info("Database initialized");
};

export default fp(dbPlugin, {
  name: "db",
});
