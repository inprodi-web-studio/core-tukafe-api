import { z } from "zod";
import { recipeSchema, variationSchema } from "../product.schemas";

const createBaseBodySchema = z.object({
  name: z.string().nonempty(),
  kitchenName: z.string().nullish(),
  price: z.number().nonnegative().optional(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  unitId: z.nanoid(),
  categoryId: z.nanoid().nullish(),
  taxIds: z.array(z.string()).nullish(),
  modifierIds: z.array(z.nanoid()).min(1).optional(),
  modifiers: z.array(z.nanoid()).min(1).optional(),
  variationGroupIds: z.array(z.nanoid()).min(1).optional(),
  variations: z.array(variationSchema).min(1).optional(),
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
    }),
  ])
  .superRefine((body, context) => {
    const variationsCount = body.variations?.length ?? 0;
    const variationGroupsCount = body.variationGroupIds?.length ?? 0;

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
  });

export type CreateBody = z.infer<typeof createBodySchema>;
