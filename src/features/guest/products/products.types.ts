import type {
  Organization,
  ProductType,
  Tax,
  Unit,
  Upload,
  VariationGroup,
  VariationGroupOption,
} from "@core/db/schemas";

export type GuestProductImage = Pick<Upload, "id" | "name" | "path" | "visibility" | "mimeType">;

export interface GuestProductCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  isFourPlusOneEligible: boolean;
  parentId: string | null;
  image: GuestProductImage | null;
}

export type GuestProductUnit = Pick<Unit, "id" | "name" | "abbreviation" | "precision">;

export type GuestProductTax = Pick<Tax, "id" | "name" | "rate">;

export type GuestProductOrganization = Pick<
  Organization,
  "id" | "name" | "slug" | "address" | "logo"
>;

export type GuestProductVariationGroupOption = Pick<
  VariationGroupOption,
  "id" | "variationGroupId" | "name" | "customerDescription" | "sortOrder"
> & { image: GuestProductImage | null };

export interface GuestProductVariationGroup extends Pick<
  VariationGroup,
  "id" | "name" | "customerLabel" | "sortOrder"
> {
  options: GuestProductVariationGroupOption[];
}

export interface GuestProductVariationSelection {
  group: Pick<VariationGroup, "id" | "name" | "customerLabel" | "sortOrder">;
  option: GuestProductVariationGroupOption;
}

export interface GuestProductVariation {
  id: string;
  sortOrder: number;
  priceCents: number;
  customerDescription: string | null;
  selections: GuestProductVariationSelection[];
}

export interface GuestProductListItem {
  id: string;
  name: string;
  priceCents: number | null;
  customerDescription: string | null;
  productType: ProductType;
  image: GuestProductImage | null;
  unit: GuestProductUnit;
  category: GuestProductCategory | null;
  organizations: GuestProductOrganization[];
  taxes: GuestProductTax[];
  variationGroups: GuestProductVariationGroup[];
  variations: GuestProductVariation[];
}

export interface GuestProductConfigurationProduct {
  id: string;
  name: string;
  productType: ProductType;
  image: GuestProductImage | null;
}

export interface GuestProductConfigurationPricing {
  basePriceCents: number | null;
  usesVariationPricing: boolean;
}

export interface GuestProductConfigurationVariationOption {
  id: string;
  name: string;
  customerDescription: string | null;
  image: GuestProductImage | null;
  sortOrder: number;
}

export interface GuestProductConfigurationModifierOption {
  id: string;
  name: string;
  priceCents: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface GuestProductConfigurationStepBase {
  id: string;
  name: string;
  label: string;
  required: boolean;
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
}

export interface GuestProductConfigurationVariationStep extends GuestProductConfigurationStepBase {
  type: "variation";
  maxSelect: 1;
  options: GuestProductConfigurationVariationOption[];
}

export interface GuestProductConfigurationModifierStep extends GuestProductConfigurationStepBase {
  type: "modifier";
  multiSelect: boolean;
  options: GuestProductConfigurationModifierOption[];
}

export type GuestProductConfigurationStep =
  | GuestProductConfigurationVariationStep
  | GuestProductConfigurationModifierStep;

export interface GuestProductConfigurationVariationSelection {
  variationGroupId: string;
  variationOptionId: string;
}

export interface GuestProductConfigurationVariation {
  id: string;
  sortOrder: number;
  priceCents: number;
  customerDescription: string | null;
  selections: GuestProductConfigurationVariationSelection[];
}

export interface GuestProductConfiguration {
  product: GuestProductConfigurationProduct;
  pricing: GuestProductConfigurationPricing;
  steps: GuestProductConfigurationStep[];
  variations: GuestProductConfigurationVariation[];
}

export interface GuestProductCustomerOrderCount {
  productId: string;
  customerId: string;
  orderedUnitsCount: number;
}

export interface GuestProductsService {
  list(): Promise<GuestProductListItem[]>;
  getConfiguration(productId: string): Promise<GuestProductConfiguration>;
  getCustomerProductOrderCount(
    productId: string,
    customerId: string,
  ): Promise<GuestProductCustomerOrderCount>;
}
