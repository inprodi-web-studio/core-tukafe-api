import qs from "qs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "@core/config/env.config";
import { authPlugin, dbPlugin, errorHandlerPlugin, zodSchemaPlugin } from "@core/plugins";
import { TRUSTED_ORIGINS } from "@core/constants";

const server = Fastify({
  logger: {
    level: "debug",
    transport:
      env.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          }
        : undefined,
  },
  routerOptions: {
    querystringParser: (str) =>
      qs.parse(str, {
        allowDots: false,
        arrayLimit: 1000,
        depth: 10,
        parseArrays: true,
      }),
  },
});

await server.register(cors, {
  origin: TRUSTED_ORIGINS,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
});

// --- Plugins
await server.register(dbPlugin);
await server.register(zodSchemaPlugin);
await server.register(errorHandlerPlugin);
await server.register(authPlugin);

const start = async () => {
  try {
    await server.listen({ port: env.PORT, host: env.HOST });

    server.log.info(`Server listening on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);

    process.exit(1);
  }
};

start();
