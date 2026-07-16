import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { adminTeamService } from "./team.service";
import type { AdminTeamService } from "./team.types";

declare module "@core/types/feature-namespaces" {
  interface AdminNamespace {
    team: AdminTeamService;
  }
}

const adminTeamServicesPlugin: FastifyPluginAsync = async (fastify) => {
  const teamService = adminTeamService(fastify);

  fastify.admin.team = teamService;
};

export default fp(adminTeamServicesPlugin, {
  name: "admin-team-services-plugin",
  dependencies: ["feature-namespaces"],
});
