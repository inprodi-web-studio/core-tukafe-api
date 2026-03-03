import { normalizeString } from "@core/utils";
import type { CreateSupplyServiceParams } from "./supplies.types";

export const normalizeSupplyInput = ({
  name,
  description,
  ...rest
}: CreateSupplyServiceParams) => {
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
