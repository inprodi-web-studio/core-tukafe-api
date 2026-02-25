import type { User } from "@core/db/schemas";
import { z } from "zod";

export const loginWithEmailBodySchema = z
  .object({
    email: z.email(),
    password: z.string().nonempty(),
  })
  .strict();

export type LoginWithEmailBody = z.infer<typeof loginWithEmailBodySchema>;

export const loginResponseSchema = z
  .object({
    user: z.custom<User>(),
  })
  .strict();

export type LoginResponse = z.infer<typeof loginResponseSchema>;
