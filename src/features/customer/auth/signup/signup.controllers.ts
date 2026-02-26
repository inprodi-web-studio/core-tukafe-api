import type { FastifyReply, FastifyRequest } from "fastify";
import { type SignupWithPhoneBody } from "./signup.schemas";

export async function signupWithPhone(request: FastifyRequest, reply: FastifyReply) {
  const data = request.body as SignupWithPhoneBody;

  const response = await request.server.customer.auth.signupWithPhone(data);

  return reply.status(201).send(response);
}
