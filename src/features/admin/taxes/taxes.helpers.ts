import { normalizeString, toBase100Integer } from "@core/utils";
import type { CreateTaxServiceParams } from "./taxes.types";

export function normalizeTaxInput({ name, rate }: CreateTaxServiceParams) {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  return {
    name: normalizedName,
    rate: toBase100Integer(rate),
  };
}
