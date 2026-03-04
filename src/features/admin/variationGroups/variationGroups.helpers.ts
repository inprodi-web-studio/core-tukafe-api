import { normalizeString } from "@core/utils";
import type {
  CreateVariationGroupOptionParams,
  CreateVariationGroupServiceParams,
  VariationGroupResponse,
} from "./variationGroups.types";

function normalizeVariationGroupOptionInput({ name, sortOrder }: CreateVariationGroupOptionParams) {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  return {
    name: normalizedName,
    sortOrder: sortOrder ?? 0,
  };
}

export function normalizeVariationGroupInput({ name, options }: CreateVariationGroupServiceParams) {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  return {
    name: normalizedName,
    options: options.map(normalizeVariationGroupOptionInput),
  };
}

export function mapVariationGroupResponse(
  variationGroup: VariationGroupResponse,
): VariationGroupResponse {
  return {
    ...variationGroup,
    options: [...variationGroup.options].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      if (left.name !== right.name) {
        return left.name.localeCompare(right.name);
      }

      return left.id.localeCompare(right.id);
    }),
  };
}
