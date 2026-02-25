import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const featureNamespacesPlugin: FastifyPluginAsync = async (fastify) => {
  if (!fastify.hasDecorator("admin")) {
    fastify.decorate("admin", {} as typeof fastify.admin);
  }

  if (!fastify.hasDecorator("customer")) {
    fastify.decorate("customer", {} as typeof fastify.customer);
  }
};

export default fp(featureNamespacesPlugin, {
  name: "feature-namespaces",
});
