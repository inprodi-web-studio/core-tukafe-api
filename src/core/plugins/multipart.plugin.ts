import multipart from "@fastify/multipart";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { env } from "@core/config/env.config";

const multipartPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      files: env.UPLOAD_MAX_FILES_PER_REQUEST,
      fileSize: env.UPLOAD_MAX_FILE_SIZE_BYTES,
    },
    throwFileSizeLimit: true,
  });
};

export default fp(multipartPlugin, {
  name: "multipart-plugin",
});
