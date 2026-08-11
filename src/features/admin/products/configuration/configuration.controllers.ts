import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  Params,
  ReplaceModifiersBody,
  ReplaceRecipeBody,
  ReplaceVariationConfigurationBody,
} from "./configuration.schemas";

export async function getConfiguration(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  const configuration = await request.server.admin.products.getConfiguration(
    request.params.productId,
  );
  return reply.status(200).send(configuration);
}

export async function replaceVariationConfiguration(
  request: FastifyRequest<{ Params: Params; Body: ReplaceVariationConfigurationBody }>,
  reply: FastifyReply,
) {
  const configuration = await request.server.admin.products.replaceVariationConfiguration(
    request.params.productId,
    request.body,
  );
  return reply.status(200).send(configuration);
}

export async function replaceModifiers(
  request: FastifyRequest<{ Params: Params; Body: ReplaceModifiersBody }>,
  reply: FastifyReply,
) {
  const configuration = await request.server.admin.products.replaceModifiers(
    request.params.productId,
    request.body,
  );
  return reply.status(200).send(configuration);
}

export async function replaceRecipe(
  request: FastifyRequest<{ Params: Params; Body: ReplaceRecipeBody }>,
  reply: FastifyReply,
) {
  const configuration = await request.server.admin.products.replaceRecipe(
    request.params.productId,
    request.body,
  );
  return reply.status(200).send(configuration);
}
