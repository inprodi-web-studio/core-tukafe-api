import { normalizeString, toBase100Integer } from "@core/utils";
import type { CreateProductServiceParams, ProductResponse, ProductWithTaxRelations } from "./products.types";

export const normalizeProductInput = ({
  name,
  price,
  taxIds,
  ...rest
}: CreateProductServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  return {
    name: normalizedName,
    priceCents: toBase100Integer(price),
    taxIds: [...new Set(taxIds ?? [])],
    ...rest,
  };
};

export const mapProductResponse = (product: ProductWithTaxRelations): ProductResponse => {
  return {
    ...product,
    taxes: product.taxes.map(({ tax }) => tax),
  };
};
