import { z } from "zod";
import { responseSchema } from "../get/get.schemas";

export const paramsSchema = z
  .object({
    productId: z.nanoid(),
  })
  .strict();

export const bodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    kitchenName: z.string().nullable().optional(),
    customerDescription: z.string().nullable().optional(),
    kitchenDescription: z.string().nullable().optional(),
    unitId: z.nanoid().optional(),
    imageUploadId: z.nanoid().nullable().optional(),
    isFeatured: z.boolean().optional(),
    categoryIds: z.array(z.nanoid()).max(100).optional(),
    taxIds: z.array(z.nanoid()).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export { responseSchema };

export type Params = z.infer<typeof paramsSchema>;
export type Body = z.infer<typeof bodySchema>;
