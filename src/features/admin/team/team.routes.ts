import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { createTeamMember, listTeam, updateTeamMember } from "./team.controllers";
import {
  createBodySchema,
  createdTeamMemberSchema,
  listQuerySchema,
  listResponseSchema,
  teamMemberParamsSchema,
  teamMemberSchema,
  updateBodySchema,
  type CreateTeamMemberBody,
  type TeamListQuery,
  type TeamMemberParams,
  type UpdateTeamMemberBody,
} from "./team.schemas";

export async function adminTeamRoutes(server: FastifyInstance) {
  server.get<{ Querystring: TeamListQuery }>(
    "/",
    {
      preHandler: [adminAuthHandler({ roles: ["owner", "admin"] })],
      schema: {
        querystring: listQuerySchema,
        response: { 200: listResponseSchema },
      },
    },
    listTeam,
  );

  server.post<{ Body: CreateTeamMemberBody }>(
    "/",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { member: ["create"] },
        }),
      ],
      schema: {
        body: createBodySchema,
        response: { 201: createdTeamMemberSchema },
      },
    },
    createTeamMember,
  );

  server.put<{ Params: TeamMemberParams; Body: UpdateTeamMemberBody }>(
    "/:memberId",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { member: ["update"] },
        }),
      ],
      schema: {
        params: teamMemberParamsSchema,
        body: updateBodySchema,
        response: { 200: teamMemberSchema },
      },
    },
    updateTeamMember,
  );
}
