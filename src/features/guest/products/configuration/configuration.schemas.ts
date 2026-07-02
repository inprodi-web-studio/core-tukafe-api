import { z } from "zod";

const imageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  mimeType: z.string(),
});

export const paramsSchema = z.object({
  productId: z.nanoid(),
});

const variationStepSchema = z.object({
  type: z.literal("variation"),
  id: z.string(),
  name: z.string(),
  label: z.string(),
  required: z.literal(true),
  minSelect: z.literal(1),
  maxSelect: z.literal(1),
  sortOrder: z.number().int().nonnegative(),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      customerDescription: z.string().nullable(),
      image: imageSchema.nullable(),
      sortOrder: z.number().int().nonnegative(),
    }),
  ),
});

const modifierStepSchema = z.object({
  type: z.literal("modifier"),
  id: z.string(),
  name: z.string(),
  label: z.string(),
  required: z.boolean(),
  multiSelect: z.boolean(),
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().nonnegative().nullable(),
  sortOrder: z.number().int().nonnegative(),
  visibleWhen: z.array(
    z.object({
      variationGroupId: z.string(),
      variationOptionId: z.string(),
    }),
  ),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      priceCents: z.number().int().nonnegative(),
      isDefault: z.boolean(),
      sortOrder: z.number().int().nonnegative(),
    }),
  ),
});

export const configurationResponseSchema = z.object({
  product: z.object({
    id: z.string(),
    name: z.string(),
    isFeatured: z.boolean(),
    productType: z.enum(["simple", "assembled", "compound"]),
    image: imageSchema.nullable(),
  }),
  pricing: z.object({
    basePriceCents: z.number().int().nonnegative().nullable(),
    usesVariationPricing: z.boolean(),
  }),
  steps: z.array(z.discriminatedUnion("type", [variationStepSchema, modifierStepSchema])),
  variations: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number().int().nonnegative(),
      priceCents: z.number().int().nonnegative(),
      customerDescription: z.string().nullable(),
      selections: z.array(
        z.object({
          variationGroupId: z.string(),
          variationOptionId: z.string(),
        }),
      ),
    }),
  ),
});

export type Params = z.infer<typeof paramsSchema>;
export type ConfigurationResponse = z.infer<typeof configurationResponseSchema>;
