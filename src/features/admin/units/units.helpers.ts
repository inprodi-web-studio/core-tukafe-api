import { normalizeString } from "@core/utils";
import type { CreateUnitServiceParams } from "./units.types";

export function normalizeUnitInput({ name, abbreviation, precision }: CreateUnitServiceParams) {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedAbbreviation = normalizeString(abbreviation, {
    trim: true,
    collapseWhitespace: true,
  });

  return {
    name: normalizedName,
    abbreviation: normalizedAbbreviation,
    precision,
  };
}
