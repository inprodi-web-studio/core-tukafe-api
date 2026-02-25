import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";

import { HttpError } from "@core/utils";
import { env } from "@core/config/env.config";

type ValidationIssue = {
  instancePath?: string;
  message?: string;
  params?: { missingProperty?: string };
};

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    const zodError =
      error instanceof ZodError
        ? error
        : error instanceof Error && error.cause instanceof ZodError
          ? error.cause
          : null;

    if (zodError) {
      const issues = zodError.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));

      return reply.status(422).send({
        code: "validation.failed",
        type: "Validation",
        message: "Validation failed",
        data: {
          errors: issues,
        },
      });
    }

    if (Array.isArray((error as { validation?: ValidationIssue[] }).validation)) {
      const issues = (error as { validation: ValidationIssue[] }).validation.map((issue) => {
        const instancePath = issue.instancePath?.replace(/^\//, "").replace(/\//g, ".");
        return {
          field: instancePath || issue.params?.missingProperty || "body",
          message: issue.message || "Invalid value",
        };
      });

      return reply.status(422).send({
        code: "validation.failed",
        type: "Validation",
        message: "Validation failed",
        data: {
          errors: issues,
        },
      });
    }

    request.log.error({ err: error }, "Unhandled error");

    return reply.status(500).send({
      code: "server.internalError",
      type: "InternalError",
      message: "Internal server error",
      data: env.NODE_ENV === "development" ? error : null,
    });
  });

  fastify.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      code: "server.routeNotFound",
      type: "NotFound",
      message: `Route ${request.method} ${request.url} not found`,
      data: {},
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: "error-handler",
});
