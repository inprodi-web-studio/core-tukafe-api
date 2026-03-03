import { normalizeString } from "@core/utils";
import type { CreateSupplyCategoryServiceParams } from "./supplyCategories.types";

export const normalizeSupplyCategoryInput = ({
  name,
  icon,
  color,
}: CreateSupplyCategoryServiceParams) => {
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
