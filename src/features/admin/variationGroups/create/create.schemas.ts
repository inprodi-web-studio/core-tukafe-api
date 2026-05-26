import { z } from "zod";

const optionSchema = z
  .object({
    name: z.string().nonempty(),
    customerDescription: z.string().nullish(),
    imageUploadId: z.string().nonempty().nullish(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    customerLabel: z.string().nullish(),
    options: z.array(optionSchema).min(1),
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
  customerLabel: z.string().nullable(),
  sortOrder: z.number().int().min(0),
  options: z.array(
    z.object({
      id: z.string(),
      variationGroupId: z.string(),
      name: z.string(),
      customerDescription: z.string().nullable(),
      image: imageSchema.nullable(),
      sortOrder: z.number().int().min(0),
    }),
  ),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
