import { phoneSchema } from "@core/utils/schemas";
import { z } from "zod";

export const signupWithPhoneBodySchema = z
  .object({
    name: z.string().nonempty(),
    middleName: z.string().nonempty(),
    email: z.email(),
    phone: phoneSchema,
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupWithPhoneBody = z.infer<typeof signupWithPhoneBodySchema>;

export const signupWithPhoneResponseSchema = z
  .object({
    userId: z.string(),
    email: z.string(),
    phone: z.string(),
  })
  .strict();

export type SignupWithPhoneResponse = z.infer<typeof signupWithPhoneResponseSchema>;
