import { normalizeString, toBase100Integer } from "@core/utils";
import type { CreateIngredientServiceParams } from "./ingredients.types";

export const normalizeIngredientInput = ({
  name,
  description,
  baseCost,
  ...rest
}: CreateIngredientServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedDescription = normalizeString(description, {
    trim: true,
    collapseWhitespace: true,
  });

  return {
    name: normalizedName,
    description: normalizedDescription,
    baseCostCents: toBase100Integer(baseCost),
    ...rest,
  };
};
