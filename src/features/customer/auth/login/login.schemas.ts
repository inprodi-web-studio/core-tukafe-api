import { phoneSchema } from "@core/utils/schemas";
import { z } from "zod";

export const loginBodySchema = z
  .object({
    email: z.email().optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(8),
  })
  .strict()
  .refine((data) => Boolean(data.email) !== Boolean(data.phone), {
    message: "Provide either email or phone",
    path: ["email"],
  });

export type LoginBody = z.infer<typeof loginBodySchema>;

export const loginResponseSchema = z
  .object({
    token: z.string(),
    userId: z.string(),
    email: z.string().nullable(),
    phone: z.string(),
  })
  .strict();

export type LoginResponse = z.infer<typeof loginResponseSchema>;
