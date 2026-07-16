import { z } from "zod";

export const dashboardPeriodSchema = z.enum(["day", "week", "month", "year"]);

export const dashboardQuerySchema = z
  .object({
    period: dashboardPeriodSchema.default("month"),
    anchorDate: z.iso.date(),
    organizationId: z.string().trim().min(1).optional(),
  })
  .strict();

const dashboardMetricSchema = z.object({
  value: z.number().nonnegative(),
  previousValue: z.number().nonnegative(),
  changePercent: z.number().nullable(),
});

const dashboardTimelineItemSchema = z.object({
  bucket: z.string(),
  orders: z.number().int().nonnegative(),
  generatedSalesCents: z.number().int().nonnegative(),
  netCollectedCents: z.number().int().nonnegative(),
  tipsCents: z.number().int().nonnegative(),
  freeDrinkRedemptions: z.number().int().nonnegative(),
  freeDrinkUnits: z.number().int().nonnegative(),
  cashbackRedemptions: z.number().int().nonnegative(),
  cashbackRedeemedCents: z.number().int().nonnegative(),
});

const dashboardTopProductSchema = z.object({
  productId: z.string(),
  name: z.string(),
  deliveredUnits: z.number().nonnegative(),
  paidUnits: z.number().nonnegative(),
  freeUnits: z.number().nonnegative(),
  generatedSalesCents: z.number().int().nonnegative(),
});

export const dashboardResponseSchema = z.object({
  scope: z.object({
    period: dashboardPeriodSchema,
    granularity: z.enum(["hour", "day", "month"]),
    timezone: z.literal("America/Mexico_City"),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    comparisonStartAt: z.string().datetime(),
    comparisonEndAt: z.string().datetime(),
    organizationId: z.string().nullable(),
    organizationCount: z.number().int().positive(),
  }),
  summary: z.object({
    orders: dashboardMetricSchema,
    generatedSalesCents: dashboardMetricSchema,
    netCollectedCents: dashboardMetricSchema,
    tipsCents: dashboardMetricSchema,
  }),
  timeline: z.array(dashboardTimelineItemSchema),
  topProducts: z.array(dashboardTopProductSchema).max(5),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
