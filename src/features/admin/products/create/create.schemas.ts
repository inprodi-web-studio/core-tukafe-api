import { z } from "zod";
import { recipeSchema, variationSchema } from "../product.schemas";

const productModifierConfigSchema = z
  .object({
    modifierId: z.nanoid(),
    optionIds: z.array(z.nanoid()).min(1).nullish(),
    visibleWhen: z
      .array(
        z
          .object({
            variationGroupId: z.nanoid(),
            variationOptionId: z.nanoid(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

const compoundComponentSchema = z
  .object({
    productId: z.nanoid(),
    quantity: z.number().int().positive().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    label: z.string().trim().min(1).max(120).nullish(),
  })
  .strict();

const createBaseBodySchema = z.object({
  name: z.string().nonempty(),
  kitchenName: z.string().nullish(),
  price: z.number().nonnegative().optional(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  unitId: z.nanoid(),
  categoryId: z.nanoid().nullish(),
  categoryIds: z.array(z.nanoid()).min(1).optional(),
  imageUploadId: z.string().nonempty().nullish(),
  isFeatured: z.boolean().optional(),
  taxIds: z.array(z.string()).nullish(),
  organizationIds: z.array(z.nanoid()).min(1).optional(),
  modifierIds: z.array(z.nanoid()).min(1).optional(),
  modifiers: z.array(z.nanoid()).min(1).optional(),
  modifierConfigs: z.array(productModifierConfigSchema).min(1).optional(),
  variationGroupIds: z.array(z.nanoid()).min(1).optional(),
  variations: z.array(variationSchema).min(1).optional(),
  compoundComponents: z.array(compoundComponentSchema).optional(),
});

export const createBodySchema = z
  .discriminatedUnion("productType", [
    createBaseBodySchema.extend({
      productType: z.literal("assembled"),
      recipe: recipeSchema.optional(),
    }),
    createBaseBodySchema.extend({
      productType: z.literal("simple"),
      recipe: z.never().optional(),
    }),
    createBaseBodySchema.extend({
      productType: z.literal("compound"),
      recipe: z.never().optional(),
      price: z.number().nonnegative(),
      compoundComponents: z.array(compoundComponentSchema).min(2).optional(),
    }),
  ])
  .superRefine((body, context) => {
    const variationsCount = body.variations?.length ?? 0;
    const variationGroupsCount = body.variationGroupIds?.length ?? 0;
    const legacyModifierInputsCount = (body.modifierIds ? 1 : 0) + (body.modifiers ? 1 : 0);

    if (legacyModifierInputsCount > 1) {
      context.addIssue({
        code: "custom",
        message: "Use only one legacy modifier field",
        path: ["modifierIds"],
      });
    }

    if (body.modifierConfigs && legacyModifierInputsCount > 0) {
      context.addIssue({
        code: "custom",
        message: "Use modifierConfigs or modifierIds/modifiers, not both",
        path: ["modifierConfigs"],
      });
    }

    if (variationsCount > 0 && variationGroupsCount === 0) {
      context.addIssue({
        code: "custom",
        message: "Products with variations must include variation groups",
        path: ["variationGroupIds"],
      });
    }

    if (variationsCount > 0 && body.price !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Products with variations cannot include a base price",
        path: ["price"],
      });
    }

    if (variationsCount === 0 && body.price === undefined) {
      context.addIssue({
        code: "custom",
        message: "Products without variations require a base price",
        path: ["price"],
      });
    }

    if (body.productType === "assembled") {
      if (variationsCount > 0 && body.recipe !== undefined) {
        context.addIssue({
          code: "custom",
          message: "Assembled products with variations cannot include a base recipe",
          path: ["recipe"],
        });
      }

      if (variationsCount === 0 && body.recipe === undefined) {
        context.addIssue({
          code: "custom",
          message: "Assembled products without variations require a recipe",
          path: ["recipe"],
        });
      }

      body.variations?.forEach((variation, index) => {
        if (variation.recipe === undefined) {
          context.addIssue({
            code: "custom",
            message: "Each variation must include a recipe for assembled products",
            path: ["variations", index, "recipe"],
          });
        }
      });
    }

    if (body.productType !== "assembled") {
      body.variations?.forEach((variation, index) => {
        if (variation.recipe !== undefined) {
          context.addIssue({
            code: "custom",
            message: "Only assembled products can include recipes in variations",
            path: ["variations", index, "recipe"],
          });
        }
      });
    }

    if (body.productType !== "compound" && body.compoundComponents !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only compound products can include compoundComponents",
        path: ["compoundComponents"],
      });
    }
  });

export type CreateBody = z.infer<typeof createBodySchema>;
