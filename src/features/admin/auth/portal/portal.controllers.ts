import type { FastifyReply, FastifyRequest } from "fastify";
import type { PortalLoginBody, SetPortalActiveOrganizationBody } from "./portal.schemas";

function setSessionCookie(reply: FastifyReply, cookie: string | null) {
  if (cookie) {
    reply.header("set-cookie", cookie);
  }
}

export async function portalLogin(
  request: FastifyRequest<{ Body: PortalLoginBody }>,
  reply: FastifyReply,
) {
  const { session, cookie } = await request.server.admin.auth.loginToPortal(
    request.body,
    request.headers,
  );

  setSessionCookie(reply, cookie);
  return reply.status(200).send(session);
}

export async function getPortalSession(request: FastifyRequest, reply: FastifyReply) {
  const session = await request.server.admin.auth.getPortalSession(request.headers);

  return reply.status(200).send(session);
}

export async function setPortalActiveOrganization(
  request: FastifyRequest<{ Body: SetPortalActiveOrganizationBody }>,
  reply: FastifyReply,
) {
  const { session, cookie } = await request.server.admin.auth.setPortalActiveOrganization(
    request.body,
    request.headers,
  );

  setSessionCookie(reply, cookie);
  return reply.status(200).send(session);
}
