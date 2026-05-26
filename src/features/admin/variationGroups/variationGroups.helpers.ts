import { normalizeString } from "@core/utils";
import type {
  CreateVariationGroupOptionParams,
  CreateVariationGroupServiceParams,
  VariationGroupResponse,
  VariationGroupOptionResponse,
} from "./variationGroups.types";

function normalizeVariationGroupOptionInput({
  name,
  customerDescription,
  imageUploadId,
  sortOrder,
}: CreateVariationGroupOptionParams) {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedCustomerDescription = customerDescription
    ? normalizeString(customerDescription, {
        trim: true,
        collapseWhitespace: true,
      })
    : null;

  const normalizedImageUploadId = imageUploadId
    ? normalizeString(imageUploadId, {
        trim: true,
        collapseWhitespace: true,
      })
    : null;

  return {
    name: normalizedName,
    customerDescription: normalizedCustomerDescription,
    imageUploadId: normalizedImageUploadId,
    sortOrder: sortOrder ?? 0,
  };
}

export function normalizeVariationGroupInput({
  name,
  customerLabel,
  options,
}: CreateVariationGroupServiceParams) {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });

  const normalizedCustomerLabel = customerLabel
    ? normalizeString(customerLabel, {
        trim: true,
        collapseWhitespace: true,
      })
    : null;

  return {
    name: normalizedName,
    customerLabel: normalizedCustomerLabel,
    options: options.map(normalizeVariationGroupOptionInput),
  };
}

export function mapVariationGroupOptionResponse(
  option: VariationGroupOptionResponse,
): VariationGroupOptionResponse {
  return {
    ...option,
    customerDescription: option.customerDescription ?? null,
    image: option.image ?? null,
  };
}

export function mapVariationGroupResponse(
  variationGroup: VariationGroupResponse,
): VariationGroupResponse {
  return {
    ...variationGroup,
    customerLabel: variationGroup.customerLabel ?? null,
    options: [...variationGroup.options].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      if (left.name !== right.name) {
        return left.name.localeCompare(right.name);
      }

      return left.id.localeCompare(right.id);
    }).map(mapVariationGroupOptionResponse),
  };
}
