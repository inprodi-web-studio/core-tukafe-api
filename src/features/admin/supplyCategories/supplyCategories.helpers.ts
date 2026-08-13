import { normalizeString } from "@core/utils";
import type {
  CreateSupplyCategoryServiceParams,
  UpdateSupplyCategoryServiceParams,
} from "./supplyCategories.types";

export const normalizeSupplyCategoryInput = ({
  name,
  icon,
  color,
}: CreateSupplyCategoryServiceParams) => {
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

export const normalizeSupplyCategoryUpdateInput = (input: UpdateSupplyCategoryServiceParams) => ({
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
