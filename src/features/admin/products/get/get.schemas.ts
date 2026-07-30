import { z } from "zod";

export const paramsSchema = z
  .object({
    productId: z.nanoid(),
  })
  .strict();

const imageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  mimeType: z.string(),
});

export const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchenName: z.string().nullable(),
  customerDescription: z.string().nullable(),
  kitchenDescription: z.string().nullable(),
  isFeatured: z.boolean(),
  productType: z.enum(["simple", "assembled", "compound"]),
  updatedAt: z.date(),
  image: imageSchema.nullable(),
  unit: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    precision: z.number().int().nonnegative(),
  }),
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
    }),
  ),
  taxes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rate: z.number().int().nonnegative(),
    }),
  ),
});

export type Params = z.infer<typeof paramsSchema>;
export type Response = z.infer<typeof responseSchema>;
