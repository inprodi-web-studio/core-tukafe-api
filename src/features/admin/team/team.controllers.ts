import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateTeamMemberBody, TeamListQuery } from "./team.schemas";

export async function listTeam(
  request: FastifyRequest<{ Querystring: TeamListQuery }>,
  reply: FastifyReply,
) {
  const team = await request.server.admin.team.list({
    ...request.query,
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
