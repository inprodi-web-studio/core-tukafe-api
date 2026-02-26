import type { FastifyReply, FastifyRequest } from "fastify";
import type { ResendOTPBody, VerifyPhoneBody } from "./verification.schemas";

export async function resendOTP(request: FastifyRequest, reply: FastifyReply) {
  const data = request.body as ResendOTPBody;

  await request.server.customer.auth.resendOTP(data);

  return reply.status(200).send({ success: true });
}

export async function verifyPhone(request: FastifyRequest, reply: FastifyReply) {
  const data = request.body as VerifyPhoneBody;

  const response = await request.server.customer.auth.verifyPhone(data);

  return reply.status(200).send(response);
}
