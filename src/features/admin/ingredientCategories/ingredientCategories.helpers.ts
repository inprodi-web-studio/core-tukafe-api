import { normalizeString } from "@core/utils";
import type {
  CreateIngredientCategoryServiceParams,
  UpdateIngredientCategoryServiceParams,
} from "./ingredientCategories.types";

export const normalizeIngredientCategoryInput = ({
  name,
  icon,
  color,
}: CreateIngredientCategoryServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedIcon = normalizeString(icon ?? "CircleDashedIcon", {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedColor = normalizeString(color, {
    trim: true,
    uppercase: true,
  });

  return {
    name: normalizedName,
    icon: normalizedIcon,
    color: normalizedColor,
  };
};

export const normalizeIngredientCategoryUpdateInput = (
  input: UpdateIngredientCategoryServiceParams,
) => ({
  ...input,
  ...(input.name !== undefined && {
    name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
  }),
  ...(input.icon !== undefined && {
    icon: normalizeString(input.icon, { trim: true, collapseWhitespace: true }),
  }),
  ...(input.color !== undefined && {
    color: normalizeString(input.color, { trim: true, uppercase: true }),
  }),
});
