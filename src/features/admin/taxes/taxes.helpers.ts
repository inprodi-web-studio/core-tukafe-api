import { fromBase100Integer, normalizeString, toBase100Integer } from "@core/utils";
import type { Tax } from "@core/db/schemas";
import type { CreateTaxServiceParams, TaxListItem } from "./taxes.types";

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

export function mapTaxOutput(tax: Tax): TaxListItem {
  return {
    id: tax.id,
    name: tax.name,
    rate: fromBase100Integer(tax.rate),
    createdAt: tax.createdAt!,
    updatedAt: tax.updatedAt!,
  };
}
