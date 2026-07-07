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

const configurationProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  isFeatured: z.boolean(),
  productType: z.enum(["simple", "assembled", "compound"]),
  image: imageSchema.nullable(),
});

const configurationPricingSchema = z.object({
  basePriceCents: z.number().int().nonnegative().nullable(),
  usesVariationPricing: z.boolean(),
});

const configurationVariationSchema = z.object({
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
});

const configurationBaseSchema = z.object({
  product: z.object({
    id: z.string(),
    name: z.string(),
    isFeatured: z.boolean(),
    productType: z.enum(["simple", "assembled", "compound"]),
    image: imageSchema.nullable(),
  }),
  pricing: configurationPricingSchema,
  steps: z.array(z.discriminatedUnion("type", [variationStepSchema, modifierStepSchema])),
  variations: z.array(configurationVariationSchema),
});

export const configurationResponseSchema = configurationBaseSchema.extend({
  product: configurationProductSchema,
  compoundComponents: z.array(
    configurationBaseSchema.extend({
      componentId: z.string(),
      quantity: z.number().int().positive(),
      sortOrder: z.number().int().nonnegative(),
      label: z.string().nullable(),
      product: configurationProductSchema,
    }),
  ),
  compoundSlots: z.array(
    z.object({
      slotId: z.string(),
      label: z.string(),
      quantity: z.number().int().positive(),
      sortOrder: z.number().int().nonnegative(),
      options: z.array(
        configurationBaseSchema.extend({
          optionId: z.string(),
          productId: z.string(),
          sortOrder: z.number().int().nonnegative(),
          label: z.string().nullable(),
          product: configurationProductSchema,
        }),
      ),
    }),
  ),
});

export type Params = z.infer<typeof paramsSchema>;
export type ConfigurationResponse = z.infer<typeof configurationResponseSchema>;
