import { phoneSchema, successResponseSchema } from "@core/utils";
import { z } from "zod";

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

export const changePasswordResponseSchema = z
  .object({
    status: z.literal(true),
  })
  .strict();

export const requestPasswordResetBodySchema = z
  .object({
    phone: phoneSchema,
  })
  .strict();

export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetBodySchema>;

export const validatePasswordResetCodeBodySchema = z
  .object({
    phone: phoneSchema,
    code: z.string().length(6, "Code must be exactly 6 digits"),
  })
  .strict();

export type ValidatePasswordResetCodeBody = z.infer<typeof validatePasswordResetCodeBodySchema>;

export const resetPasswordBodySchema = z
  .object({
    phone: phoneSchema,
    code: z.string().length(6, "Code must be exactly 6 digits"),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

export const passwordResetResponseSchema = successResponseSchema;
