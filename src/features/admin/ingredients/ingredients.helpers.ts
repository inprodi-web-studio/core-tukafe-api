import { normalizeString } from "@core/utils";
import type {
  CreateIngredientServiceParams,
  UpdateIngredientServiceParams,
} from "./ingredients.types";

export const normalizeIngredientInput = ({
  name,
  description,
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
    ...rest,
  };
};

export const normalizeIngredientUpdateInput = (input: UpdateIngredientServiceParams) => ({
  ...input,
  ...(input.name !== undefined && {
    name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
  }),
  ...(input.description !== undefined && {
    description: normalizeString(input.description, { trim: true, collapseWhitespace: true }),
  }),
});
