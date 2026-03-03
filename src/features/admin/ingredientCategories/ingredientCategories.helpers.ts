import { normalizeString } from "@core/utils";
import type { CreateIngredientCategoryServiceParams } from "./ingredientCategories.types";

export const normalizeIngredientCategoryInput = ({
  name,
  icon,
  color,
}: CreateIngredientCategoryServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedIcon = normalizeString(icon, {
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
