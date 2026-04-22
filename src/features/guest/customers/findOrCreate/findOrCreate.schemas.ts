import { phoneSchema } from "@core/utils";
import { z } from "zod";

export const findOrCreateBodySchema = z
  .object({
    phone: phoneSchema.refine(
      (value) => /^\+[1-9]\d{10,14}$/.test(value),
      "Phone must include country code and local number (e.g. +523314325666)",
    ),
  })
  .strict();

export type FindOrCreateBody = z.infer<typeof findOrCreateBodySchema>;

export const customerSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  phone: z.string(),
  name: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
});

export const findOrCreateResponseSchema = z.object({
  created: z.boolean(),
  customer: customerSchema,
});

export type FindOrCreateResponse = z.infer<typeof findOrCreateResponseSchema>;
