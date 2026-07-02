import { accountDB, customersDB, sessionDB, userDB } from "@core/db/schemas";
import { eq, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { UpdateCurrentCustomerBody } from "./me.schemas";

function currentCustomerResponse(request: FastifyRequest) {
  const { customer, session, user } = request.customerAuth;

  return {
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
  };
}

export async function getCurrentCustomer(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send(currentCustomerResponse(request));
}

export async function updateCurrentCustomer(
  request: FastifyRequest<{ Body: UpdateCurrentCustomerBody }>,
  reply: FastifyReply,
) {
  const { customer } = request.customerAuth;
  const [updatedCustomer] = await request.server.db
    .update(customersDB)
    .set({
      name: request.body.name,
      middleName: request.body.middleName ?? null,
      lastName: request.body.lastName,
      updatedAt: sql`now()`,
    })
    .where(eq(customersDB.id, customer.id))
    .returning();

  request.customerAuth.customer = updatedCustomer ?? customer;

  return reply.status(200).send(currentCustomerResponse(request));
}

export async function closeCurrentCustomer(request: FastifyRequest, reply: FastifyReply) {
  const { customer, user } = request.customerAuth;
  const closedAccountEmail = `closed-${user.id}@closed.tukafe.local`;

  await request.server.db.transaction(async (tx) => {
    await tx
      .update(customersDB)
      .set({
        userId: null,
        phone: null,
        name: null,
        middleName: null,
        lastName: null,
        email: null,
        stripeCustomerId: null,
        deletedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(customersDB.id, customer.id));

    await tx.delete(sessionDB).where(eq(sessionDB.userId, user.id));
    await tx.delete(accountDB).where(eq(accountDB.userId, user.id));

    await tx
      .update(userDB)
      .set({
        name: "Cuenta cerrada",
        middleName: null,
        lastName: null,
        email: closedAccountEmail,
        emailVerified: false,
        phoneNumber: null,
        phoneNumberVerified: false,
        image: null,
        updatedAt: sql`now()`,
      })
      .where(eq(userDB.id, user.id));
  });

  return reply.status(200).send({ success: true });
}

export async function createCurrentCustomerQrLoginToken(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { customer } = request.customerAuth;
  const token = await request.server.customer.auth.createQrLoginToken({
    customerId: customer.id,
  });

  return reply.status(200).send(token);
}
