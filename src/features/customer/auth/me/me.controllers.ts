import type { FastifyReply, FastifyRequest } from "fastify";

export async function getCurrentCustomer(request: FastifyRequest, reply: FastifyReply) {
  const { customer, session, user } = request.customerAuth;

  return reply.status(200).send({
    token: session.token,
    userId: user.id,
    email: user.email ?? null,
    phone: customer.phone ?? "",
    customerId: customer.id,
    expiresAt: session.expiresAt.toISOString(),
    customer: {
      id: customer.id,
      name: customer.name ?? null,
      middleName: customer.middleName ?? null,
      lastName: customer.lastName ?? null,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
    },
  });
}
