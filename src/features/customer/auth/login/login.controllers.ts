import { badRequest } from "@core/utils";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { LoginBody } from "./login.schemas";

export async function loginWithEmailOrPhone(request: FastifyRequest, reply: FastifyReply) {
  const data = request.body as LoginBody;
  const input = data.email
    ? { email: data.email, password: data.password }
    : data.phone
      ? { phone: data.phone, password: data.password }
      : (() => {
          throw badRequest("auth.identifierRequired", "Email or phone number is required");
        })();

  const response = await request.server.customer.auth.loginWithEmailOrPhone(
    input,
    request.headers,
  );

  return reply.status(200).send(response);
}
