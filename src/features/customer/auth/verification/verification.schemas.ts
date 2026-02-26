import { phoneSchema } from "@core/utils/schemas";
import { z } from "zod";

export const resendOTPBodySchema = z.object({ phone: phoneSchema }).strict();

export type ResendOTPBody = z.infer<typeof resendOTPBodySchema>;

export const verifyPhoneBodySchema = z
  .object({
    phone: phoneSchema,
    code: z.string().length(6, "Code must be exactly 6 digits"),
  })
  .strict();

export type VerifyPhoneBody = z.infer<typeof verifyPhoneBodySchema>;

export const verifyPhoneResponseSchema = z
  .object({
    token: z.string(),
    userId: z.string(),
    email: z.string(),
    phone: z.string(),
  })
  .strict();

export type VerifyPhoneResponse = z.infer<typeof verifyPhoneResponseSchema>;
