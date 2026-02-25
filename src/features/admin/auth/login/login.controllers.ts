import type { FastifyReply, FastifyRequest } from "fastify";
import type { LoginWithEmailBody } from "./login.schemas";

export async function loginWithEmail(request: FastifyRequest, reply: FastifyReply) {
  const data = request.body as LoginWithEmailBody;

  const { user, cookie } = await request.server.admin.auth.loginWithEmail(data, request.headers);

  if (cookie) {
    reply.header("set-cookie", cookie);
  }

  return reply.status(200).send({ user });
}
