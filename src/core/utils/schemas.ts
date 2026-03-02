import { parsePhoneNumberWithError } from "libphonenumber-js";
import { z } from "zod";

export const phoneSchema = z.string().refine(
  (value) => {
    try {
      return parsePhoneNumberWithError(value).isValid();
    } catch {
      return false;
    }
  },
  { message: "Invalid phone number format (e.g., +523314328388)" },
);

export const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a 6 digit hex color");

export const successResponseSchema = z.object({ success: z.boolean() }).strict();

export const listQueryParamsSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().optional().nullable(),
  })
  .strict();

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: paginationSchema,
  });
}
