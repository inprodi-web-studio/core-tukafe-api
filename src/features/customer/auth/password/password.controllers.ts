import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  ChangePasswordBody,
  RequestPasswordResetBody,
  ResetPasswordBody,
  ValidatePasswordResetCodeBody,
} from "./password.schemas";

export async function changePassword(
  request: FastifyRequest<{ Body: ChangePasswordBody }>,
  reply: FastifyReply,
) {
  await request.server.customer.auth.changePassword(
    {
      currentPassword: request.body.currentPassword,
      newPassword: request.body.newPassword,
    },
    request.headers,
  );

  return reply.status(200).send({ status: true });
}

export async function requestPasswordReset(
  request: FastifyRequest<{ Body: RequestPasswordResetBody }>,
  reply: FastifyReply,
) {
  await request.server.customer.auth.requestPasswordReset({
    phone: request.body.phone,
  });

  return reply.status(200).send({ success: true });
}

export async function resetPassword(
  request: FastifyRequest<{ Body: ResetPasswordBody }>,
  reply: FastifyReply,
) {
  await request.server.customer.auth.resetPassword({
    phone: request.body.phone,
    code: request.body.code,
    newPassword: request.body.newPassword,
  });

  return reply.status(200).send({ success: true });
}

export async function validatePasswordResetCode(
  request: FastifyRequest<{ Body: ValidatePasswordResetCodeBody }>,
  reply: FastifyReply,
) {
  await request.server.customer.auth.validatePasswordResetCode({
    phone: request.body.phone,
    code: request.body.code,
  });

  return reply.status(200).send({ success: true });
}
