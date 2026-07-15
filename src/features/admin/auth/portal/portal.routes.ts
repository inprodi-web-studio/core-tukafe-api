import type { FastifyInstance } from "fastify";
import { getPortalSession, portalLogin, setPortalActiveOrganization } from "./portal.controllers";
import {
  portalLoginBodySchema,
  portalSessionSchema,
  setPortalActiveOrganizationBodySchema,
} from "./portal.schemas";

export async function portalRoutes(server: FastifyInstance) {
  server.post(
    "/login",
    {
      schema: {
        body: portalLoginBodySchema,
        response: { 200: portalSessionSchema },
      },
    },
    portalLogin,
  );

  server.get(
    "/session",
    {
      schema: {
        response: { 200: portalSessionSchema },
      },
    },
    getPortalSession,
  );

  server.put(
    "/active-organization",
    {
      schema: {
        body: setPortalActiveOrganizationBodySchema,
        response: { 200: portalSessionSchema },
      },
    },
    setPortalActiveOrganization,
  );
}
