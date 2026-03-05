import { createPaginatedResponseSchema, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const quantitySchema = z
  .number()
  .positive()
  .refine((value) => {
    const decimals = value.toString().split(".")[1]?.length ?? 0;
    return decimals <= MAX_SUPPORTED_DECIMAL_PLACES;
  }, `Quantity must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`);

export const optionIngredientBodySchema = z.object({
  ingredientId: z.nanoid(),
  quantity: quantitySchema,
});

export const optionSupplyBodySchema = z.object({
  supplyId: z.nanoid(),
  quantity: quantitySchema,
});

export const optionBodySchema = z
  .object({
    name: z.string().nonempty(),
    kitchenName: z.string().nullish(),
    customerName: z.string().nullish(),
    price: z.number().nonnegative().optional(),
    isDefault: z.boolean().optional(),
    ingredients: z.array(optionIngredientBodySchema).optional(),
    supplies: z.array(optionSupplyBodySchema).optional(),
  })
  .strict();

export const optionIngredientResponseSchema = z.object({
  quantity: z.number().positive(),
  ingredient: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    baseCostPerUnit: z.number().nonnegative(),
    baseUnit: z.object({
      id: z.string(),
      name: z.string(),
      abbreviation: z.string(),
      precision: z.number().int().min(0),
    }),
    category: z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      color: z.string(),
    }),
  }),
});

export const optionSupplyResponseSchema = z.object({
  quantity: z.number().positive(),
  supply: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    baseCostPerUnit: z.number().nonnegative(),
    baseUnit: z.object({
      id: z.string(),
      name: z.string(),
      abbreviation: z.string(),
      precision: z.number().int().min(0),
    }),
    category: z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      color: z.string(),
    }),
  }),
});

export const modifierResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchenName: z.string().nullish(),
  customerLabel: z.string().nullish(),
  multiSelect: z.boolean(),
  minSelect: z.number().int().min(0),
  maxSelect: z.number().int().min(0).nullable(),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kitchenName: z.string().nullish(),
      customerName: z.string().nullish(),
      priceCents: z.number().int().nonnegative(),
      sortOrder: z.number().int().min(0),
      isDefault: z.boolean(),
      ingredients: z.array(optionIngredientResponseSchema),
      supplies: z.array(optionSupplyResponseSchema),
    }),
  ),
});

export const listQueryParamsSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().optional().nullable(),
  })
  .strict();

export const listResponseSchema = createPaginatedResponseSchema(modifierResponseSchema);
