import { z } from "zod";

export const currentCustomerResponseSchema = z
  .object({
    token: z.string(),
    userId: z.string(),
    email: z.string().nullable(),
    phone: z.string(),
    customerId: z.string(),
    expiresAt: z.string(),
    customer: z
      .object({
        id: z.string(),
        name: z.string().nullable(),
        middleName: z.string().nullable(),
        lastName: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export type CurrentCustomerResponse = z.infer<typeof currentCustomerResponseSchema>;
