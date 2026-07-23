export type DashboardPeriod = "day" | "week" | "month" | "year";
export type DashboardGranularity = "hour" | "day" | "month";
export type DashboardOrderSource = "inplace" | "mobile" | "admin" | "unknown";

export interface DashboardMetric {
  value: number;
  previousValue: number;
  changePercent: number | null;
}

export interface DashboardTimelineItem {
  bucket: string;
  orders: number;
  productUnits: number;
  generatedSalesCents: number;
  netCollectedCents: number;
  tipsCents: number;
  freeDrinkRedemptions: number;
  freeDrinkUnits: number;
  freeDrinkRetailValueCents: number;
  freeDrinkBeverageValueCents: number;
  freeDrinkModifierValueCents: number;
  cashbackRedemptions: number;
  cashbackRedeemedCents: number;
}

export interface DashboardModifierOption {
  modifierOptionId: string;
  name: string;
  selectionUnits: number;
  paidSelectionUnits: number;
  configuredExtraCents: number;
}

export interface DashboardModifierGroup {
  modifierId: string;
  name: string;
  selectionUnits: number;
  paidSelectionUnits: number;
  configuredExtraCents: number;
  options: DashboardModifierOption[];
}

export interface DashboardVariationOption {
  variationOptionId: string;
  name: string;
  selectionUnits: number;
  associatedSalesCents: number;
}

export interface DashboardVariationGroup {
  variationGroupId: string;
  name: string;
  selectionUnits: number;
  associatedSalesCents: number;
  options: DashboardVariationOption[];
}

export interface DashboardTopProduct {
  productId: string;
  name: string;
  deliveredUnits: number;
  paidUnits: number;
  freeUnits: number;
  generatedSalesCents: number;
}

export interface DashboardOrderSourceMetric {
  orders: number;
  generatedSalesCents: number;
  netCollectedCents: number;
}

export interface DashboardOrderSources {
  totals: Record<DashboardOrderSource, DashboardOrderSourceMetric>;
  timeline: Array<{
    bucket: string;
    sources: Record<DashboardOrderSource, DashboardOrderSourceMetric>;
  }>;
}

export interface DashboardResponse {
  scope: {
    period: DashboardPeriod;
    granularity: DashboardGranularity;
    timezone: "America/Mexico_City";
    startAt: string;
    endAt: string;
    comparisonStartAt: string;
    comparisonEndAt: string;
    organizationId: string | null;
    organizationCount: number;
  };
  summary: {
    orders: DashboardMetric;
    productUnits: DashboardMetric;
    generatedSalesCents: DashboardMetric;
    netCollectedCents: DashboardMetric;
    tipsCents: DashboardMetric;
  };
  timeline: DashboardTimelineItem[];
  topProducts: DashboardTopProduct[];
  topModifierGroups: DashboardModifierGroup[];
  topVariationGroups: DashboardVariationGroup[];
  orderSources: DashboardOrderSources;
}

export interface DashboardParams {
  userId: string;
  period: DashboardPeriod;
  anchorDate: string;
  organizationId?: string;
  categoryIds?: string[];
  now?: Date;
}

export interface AdminDashboardService {
  get(input: DashboardParams): Promise<DashboardResponse>;
}
