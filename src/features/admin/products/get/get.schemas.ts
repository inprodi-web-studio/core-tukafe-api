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

export const compoundOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchenName: z.string().nullable(),
  productType: z.enum(["simple", "assembled"]),
  image: imageSchema.nullable(),
  organizationStatus: z.enum(["active", "inactive", "unassigned"]),
});

export const compoundSlotSchema = z.object({
  label: z.string(),
  quantity: z.number().int().positive(),
  sortOrder: z.number().int().nonnegative(),
  options: z.array(
    z.object({
      label: z.string().nullable(),
      sortOrder: z.number().int().nonnegative(),
      product: compoundOptionSchema,
    }),
  ),
});

export const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchenName: z.string().nullable(),
  customerDescription: z.string().nullable(),
  kitchenDescription: z.string().nullable(),
  isFeatured: z.boolean(),
  productType: z.enum(["simple", "assembled", "compound"]),
  priceCents: z.number().int().nonnegative().nullable(),
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
  compoundSlots: z.array(compoundSlotSchema),
});

export type Params = z.infer<typeof paramsSchema>;
export type Response = z.infer<typeof responseSchema>;
