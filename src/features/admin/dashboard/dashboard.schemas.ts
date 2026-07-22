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
  freeDrinkRetailValueCents: z.number().int().nonnegative(),
  freeDrinkBeverageValueCents: z.number().int().nonnegative(),
  freeDrinkModifierValueCents: z.number().int().nonnegative(),
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

const dashboardModifierOptionSchema = z.object({
  modifierOptionId: z.string(),
  name: z.string(),
  selectionUnits: z.number().nonnegative(),
  paidSelectionUnits: z.number().nonnegative(),
  configuredExtraCents: z.number().int().nonnegative(),
});

const dashboardModifierGroupSchema = z.object({
  modifierId: z.string(),
  name: z.string(),
  selectionUnits: z.number().nonnegative(),
  paidSelectionUnits: z.number().nonnegative(),
  configuredExtraCents: z.number().int().nonnegative(),
  options: z.array(dashboardModifierOptionSchema).max(8),
});

const dashboardVariationOptionSchema = z.object({
  variationOptionId: z.string(),
  name: z.string(),
  selectionUnits: z.number().nonnegative(),
  associatedSalesCents: z.number().int().nonnegative(),
});

const dashboardVariationGroupSchema = z.object({
  variationGroupId: z.string(),
  name: z.string(),
  selectionUnits: z.number().nonnegative(),
  associatedSalesCents: z.number().int().nonnegative(),
  options: z.array(dashboardVariationOptionSchema).max(8),
});

const dashboardOrderSourceMetricSchema = z.object({
  orders: z.number().int().nonnegative(),
  generatedSalesCents: z.number().int().nonnegative(),
  netCollectedCents: z.number().int().nonnegative(),
});

const dashboardOrderSourceRecordSchema = z.object({
  inplace: dashboardOrderSourceMetricSchema,
  mobile: dashboardOrderSourceMetricSchema,
  admin: dashboardOrderSourceMetricSchema,
  unknown: dashboardOrderSourceMetricSchema,
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
  topModifierGroups: z.array(dashboardModifierGroupSchema).max(8),
  topVariationGroups: z.array(dashboardVariationGroupSchema).max(8),
  orderSources: z.object({
    totals: dashboardOrderSourceRecordSchema,
    timeline: z.array(
      z.object({
        bucket: z.string(),
        sources: dashboardOrderSourceRecordSchema,
      }),
    ),
  }),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
