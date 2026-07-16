export type DashboardPeriod = "day" | "week" | "month" | "year";
export type DashboardGranularity = "hour" | "day" | "month";

export interface DashboardMetric {
  value: number;
  previousValue: number;
  changePercent: number | null;
}

export interface DashboardTimelineItem {
  bucket: string;
  orders: number;
  generatedSalesCents: number;
  netCollectedCents: number;
  tipsCents: number;
  freeDrinkRedemptions: number;
  freeDrinkUnits: number;
  cashbackRedemptions: number;
  cashbackRedeemedCents: number;
}

export interface DashboardTopProduct {
  productId: string;
  name: string;
  deliveredUnits: number;
  paidUnits: number;
  freeUnits: number;
  generatedSalesCents: number;
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
    generatedSalesCents: DashboardMetric;
    netCollectedCents: DashboardMetric;
    tipsCents: DashboardMetric;
  };
  timeline: DashboardTimelineItem[];
  topProducts: DashboardTopProduct[];
}

export interface DashboardParams {
  userId: string;
  period: DashboardPeriod;
  anchorDate: string;
  organizationId?: string;
  now?: Date;
}

export interface AdminDashboardService {
  get(input: DashboardParams): Promise<DashboardResponse>;
}
