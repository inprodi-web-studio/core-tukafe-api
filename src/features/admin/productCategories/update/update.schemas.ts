import { colorSchema } from "@core/utils";
import { z } from "zod";
import { createResponseSchema } from "../create/create.schemas";

export const paramsSchema = z
  .object({
    categoryId: z.string(),
  })
  .strict();

export type Params = z.infer<typeof paramsSchema>;

export const updateBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    icon: z.string().trim().min(1).optional(),
    color: colorSchema.optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    isFourPlusOneEligible: z.boolean().optional(),
    isCashbackEligible: z.boolean().optional(),
    imageUploadId: z.string().trim().min(1).optional(),
    parentId: z.string().nullish(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateBody = z.infer<typeof updateBodySchema>;

export const updateResponseSchema = createResponseSchema;
export type UpdateResponse = z.infer<typeof updateResponseSchema>;
