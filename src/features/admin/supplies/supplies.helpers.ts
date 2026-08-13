import { normalizeString } from "@core/utils";
import type { CreateSupplyServiceParams, UpdateSupplyServiceParams } from "./supplies.types";

export const normalizeSupplyInput = ({ name, description, ...rest }: CreateSupplyServiceParams) => {
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

export const normalizeSupplyUpdateInput = (input: UpdateSupplyServiceParams) => ({
  ...input,
  ...(input.name !== undefined && {
    name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
  }),
  ...(input.description !== undefined && {
    description: normalizeString(input.description, { trim: true, collapseWhitespace: true }),
  }),
});
