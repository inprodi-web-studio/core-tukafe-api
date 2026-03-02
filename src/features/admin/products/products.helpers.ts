import { normalizeString, toBase100Integer } from "@core/utils";
import type { CreateProductServiceParams } from "./products.types";

export const normalizeProductInput = ({ name, price, ...rest }: CreateProductServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  return {
    name: normalizedName,
    priceCents: toBase100Integer(price),
    ...rest,
  };
};
