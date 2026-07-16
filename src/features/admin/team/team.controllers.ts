import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateTeamMemberBody,
  TeamListQuery,
  TeamMemberParams,
  UpdateTeamMemberBody,
} from "./team.schemas";

export async function listTeam(
  request: FastifyRequest<{ Querystring: TeamListQuery }>,
  reply: FastifyReply,
) {
  const team = await request.server.admin.team.list({
    ...request.query,
    viewerUserId: request.auth.user.id,
    organizationId: request.auth.member.organizationId,
  });

  return reply.status(200).send(team);
}

export async function createTeamMember(
  request: FastifyRequest<{ Body: CreateTeamMemberBody }>,
  reply: FastifyReply,
) {
  const member = await request.server.admin.team.create({
    ...request.body,
    creatorUserId: request.auth.user.id,
  });

  return reply.status(201).send(member);
}

export async function updateTeamMember(
  request: FastifyRequest<{
    Params: TeamMemberParams;
    Body: UpdateTeamMemberBody;
  }>,
  reply: FastifyReply,
) {
  const member = await request.server.admin.team.update({
    ...request.body,
    memberId: request.params.memberId,
    editorUserId: request.auth.user.id,
    activeOrganizationId: request.auth.member.organizationId,
  });

  return reply.status(200).send(member);
}
