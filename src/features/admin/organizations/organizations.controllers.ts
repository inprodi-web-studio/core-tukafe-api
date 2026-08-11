import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody, ListQuery, Params, UpdateBody } from "./organizations.schemas";

export async function listOrganizations(
  request: FastifyRequest<{ Querystring: ListQuery }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(await request.server.admin.organizations.list(request.query));
}

export async function createOrganization(
  request: FastifyRequest<{ Body: CreateBody }>,
  reply: FastifyReply,
) {
  const organization = await request.server.admin.organizations.create({
    ...request.body,
    creatorUserId: request.auth.user.id,
  });
  return reply.status(201).send(organization);
}

export async function updateOrganization(
  request: FastifyRequest<{ Params: Params; Body: UpdateBody }>,
  reply: FastifyReply,
) {
  const organization = await request.server.admin.organizations.update({
    ...request.body,
    organizationId: request.params.organizationId,
  });
  return reply.status(200).send(organization);
}

export async function deactivateOrganization(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  await request.server.admin.organizations.deactivate({
    organizationId: request.params.organizationId,
    actorUserId: request.auth.user.id,
    activeOrganizationId: request.auth.member.organizationId,
  });
  return reply.status(204).send();
}

export async function restoreOrganization(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  const organization = await request.server.admin.organizations.restore(
    request.params.organizationId,
  );
  return reply.status(200).send(organization);
}
