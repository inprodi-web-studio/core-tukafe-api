import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

const zodSchemaPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
};

export default fp(zodSchemaPlugin, {
  name: "zod-schema",
});
