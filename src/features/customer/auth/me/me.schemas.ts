import { z } from "zod";

const editableCustomerNameSchema = z.string().trim().min(1).max(120);

export const updateCurrentCustomerBodySchema = z
  .object({
    name: editableCustomerNameSchema,
    middleName: z.string().trim().max(120).nullable().optional(),
    lastName: editableCustomerNameSchema,
  })
  .strict();

export type UpdateCurrentCustomerBody = z.infer<typeof updateCurrentCustomerBodySchema>;

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

export const qrLoginTokenResponseSchema = z
  .object({
    payload: z.string(),
    expiresAt: z.string(),
  })
  .strict();

export type QrLoginTokenResponse = z.infer<typeof qrLoginTokenResponseSchema>;
