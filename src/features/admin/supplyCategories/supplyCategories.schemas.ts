import { z } from "zod";

export const supplyCategoryParamsSchema = z.object({ categoryId: z.nanoid() }).strict();
export const updateSupplyCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    icon: z.string().trim().min(1).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export type SupplyCategoryParams = z.infer<typeof supplyCategoryParamsSchema>;
export type UpdateSupplyCategoryBody = z.infer<typeof updateSupplyCategoryBodySchema>;
