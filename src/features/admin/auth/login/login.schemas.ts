import type { User } from "@core/db/schemas";
import { z } from "zod";

export const loginWithEmailBodySchema = z
  .object({
    email: z.email(),
    password: z.string().nonempty(),
    organizationId: z.string().trim().min(1).optional(),
  })
  .strict();

export type LoginWithEmailBody = z.infer<typeof loginWithEmailBodySchema>;

export const loginResponseSchema = z
  .object({
    user: z.custom<User>(),
    organizationId: z.string().nullable(),
  })
  .strict();

export type LoginResponse = z.infer<typeof loginResponseSchema>;
