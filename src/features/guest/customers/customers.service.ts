import { customersDB } from "@core/db/schemas";
import { generateNanoId, getPgError, normalizePresets, normalizeString } from "@core/utils";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  FindOrCreateCustomerByPhoneResponse,
  GuestCustomerResponse,
  GuestCustomersService,
} from "./customers.types";

const customerColumns = {
  id: true,
  userId: true,
  phone: true,
  name: true,
  middleName: true,
  lastName: true,
  email: true,
} as const;

type GuestCustomerRow = {
  id: string;
  userId: string | null;
  phone: string | null;
  name: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
};

const customerReturningColumns = {
  id: customersDB.id,
  userId: customersDB.userId,
  phone: customersDB.phone,
  name: customersDB.name,
  middleName: customersDB.middleName,
  lastName: customersDB.lastName,
  email: customersDB.email,
} as const;

function mapGuestCustomerResponse(customer: GuestCustomerRow): GuestCustomerResponse {
  return {
    id: customer.id,
    userId: customer.userId ?? null,
    phone: customer.phone ?? "",
    name: customer.name ?? null,
    middleName: customer.middleName ?? null,
    lastName: customer.lastName ?? null,
    email: customer.email ?? null,
  };
}

async function loadActiveCustomerByPhone(
  fastify: FastifyInstance,
  normalizedPhone: string,
): Promise<GuestCustomerResponse | null> {
  const customer = await fastify.db.query.customersDB.findFirst({
    where(table, { and, eq, isNull }) {
      return and(eq(table.phone, normalizedPhone), isNull(table.deletedAt));
    },
    columns: customerColumns,
  });

  if (!customer) {
    return null;
  }

  return mapGuestCustomerResponse(customer);
}

async function loadActiveCustomerByUserId(
  fastify: FastifyInstance,
  userId: string,
): Promise<GuestCustomerResponse | null> {
  const customer = await fastify.db.query.customersDB.findFirst({
    where(table, { and, eq, isNull }) {
      return and(eq(table.userId, userId), isNull(table.deletedAt));
    },
    columns: customerColumns,
  });

  if (!customer) {
    return null;
  }

  return mapGuestCustomerResponse(customer);
}

export function guestCustomersService(fastify: FastifyInstance): GuestCustomersService {
  return {
    async findOrCreateByPhone({ phone }): Promise<FindOrCreateCustomerByPhoneResponse> {
      const normalizedPhone = normalizeString(phone, normalizePresets.phone);

      const existingCustomer = await loadActiveCustomerByPhone(fastify, normalizedPhone);

      if (existingCustomer) {
        return {
          created: false,
          customer: existingCustomer,
        };
      }

      const userWithPhone = await fastify.db.query.userDB.findFirst({
        where(table, { eq }) {
          return eq(table.phoneNumber, normalizedPhone);
        },
        columns: {
          id: true,
          name: true,
          middleName: true,
          lastName: true,
          email: true,
        },
      });

      if (userWithPhone) {
        const existingCustomerByUser = await loadActiveCustomerByUserId(fastify, userWithPhone.id);

        if (existingCustomerByUser) {
          if (existingCustomerByUser.phone !== normalizedPhone) {
            const [updatedCustomer] = await fastify.db
              .update(customersDB)
              .set({
                phone: normalizedPhone,
                name: userWithPhone.name ?? null,
                middleName: userWithPhone.middleName ?? null,
                lastName: userWithPhone.lastName ?? null,
                email: userWithPhone.email ?? null,
              })
              .where(eq(customersDB.id, existingCustomerByUser.id))
              .returning(customerReturningColumns);

            if (updatedCustomer) {
              return {
                created: false,
                customer: mapGuestCustomerResponse(updatedCustomer),
              };
            }
          }

          return {
            created: false,
            customer: existingCustomerByUser,
          };
        }
      }

      try {
        const [createdCustomer] = await fastify.db
          .insert(customersDB)
          .values({
            id: generateNanoId(),
            userId: userWithPhone?.id ?? null,
            phone: normalizedPhone,
            name: userWithPhone?.name ?? null,
            middleName: userWithPhone?.middleName ?? null,
            lastName: userWithPhone?.lastName ?? null,
            email: userWithPhone?.email ?? null,
          })
          .returning(customerReturningColumns);

        if (!createdCustomer) {
          throw new Error("Failed to create customer");
        }

        return {
          created: true,
          customer: mapGuestCustomerResponse(createdCustomer),
        };
      } catch (error) {
        const pgError = getPgError(error);

        if (
          pgError?.code === "23505" &&
          (pgError.constraint === "customer_phone_active_unique" ||
            pgError.constraint === "customer_user_id_active_unique")
        ) {
          const concurrentCustomer = await loadActiveCustomerByPhone(fastify, normalizedPhone);

          if (concurrentCustomer) {
            return {
              created: false,
              customer: concurrentCustomer,
            };
          }

          if (userWithPhone) {
            const concurrentCustomerByUser = await loadActiveCustomerByUserId(fastify, userWithPhone.id);

            if (concurrentCustomerByUser) {
              return {
                created: false,
                customer: concurrentCustomerByUser,
              };
            }
          }
        }

        throw error;
      }
    },
  };
}
