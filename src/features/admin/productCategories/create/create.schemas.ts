import { colorSchema } from "@core/utils";
import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    icon: z.string().nonempty(),
    color: colorSchema,
    sortOrder: z.number().int().nonnegative().optional(),
    isFourPlusOneEligible: z.boolean().optional(),
    isCashbackEligible: z.boolean().optional(),
    imageUploadId: z.string().nonempty().nullish(),
    parentId: z.string().nullish(),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

const imageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  mimeType: z.string(),
});

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  sortOrder: z.number().int().nonnegative(),
  isFourPlusOneEligible: z.boolean(),
  isCashbackEligible: z.boolean(),
  image: imageSchema.nullable(),
  parentId: z.string().nullish(),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
