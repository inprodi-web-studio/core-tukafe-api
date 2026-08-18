import {
  INVENTORY_ADJUSTMENT_DIRECTIONS,
  INVENTORY_ADJUSTMENT_REASONS,
  INVENTORY_OVERRIDE_TARGET_TYPES,
} from "@core/db/schemas";
import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const locationParamsSchema = z.object({ locationId: z.string().min(1) }).strict();
export const itemParamsSchema = z.object({ inventoryItemId: z.string().min(1) }).strict();
export const productParamsSchema = z.object({ productId: z.nanoid() }).strict();
export const adjustmentParamsSchema = z
  .object({ locationId: z.string().min(1), adjustmentId: z.string().min(1) })
  .strict();
export const locationItemParamsSchema = z
  .object({ locationId: z.string().min(1), inventoryItemId: z.string().min(1) })
  .strict();
export const overrideParamsSchema = z
  .object({ locationId: z.string().min(1), overrideId: z.string().min(1) })
  .strict();

export const createDistributionCenterBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    timezone: z.string().trim().min(1).max(100),
  })
  .strict();

export const updateItemConfigurationBodySchema = z
  .object({
    isTracked: z.boolean().optional(),
    tracksLots: z.boolean().optional(),
    isPerishable: z.boolean().optional(),
    expirationWarningDays: z.number().int().min(0).max(365).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "At least one field must be provided");

const stockBehaviorSchema = z
  .object({
    tracksLots: z.boolean(),
    isPerishable: z.boolean(),
    expirationWarningDays: z.number().int().min(0).max(365),
  })
  .strict();

export const updateProductConfigurationBodySchema = stockBehaviorSchema
  .extend({
    trackingMode: z.enum(["untracked", "recipe", "finished_good", "derived"]),
    variations: z
      .array(stockBehaviorSchema.extend({ variationId: z.nanoid() }).strict())
      .max(250)
      .optional(),
  })
  .strict();

const quantitySchema = z
  .number()
  .positive()
  .refine(
    (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
    `Quantity must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
  );

export const createAdjustmentBodySchema = z
  .object({
    direction: z.enum(INVENTORY_ADJUSTMENT_DIRECTIONS),
    reason: z.enum(INVENTORY_ADJUSTMENT_REASONS),
    observations: z.string().trim().max(1000).nullable().optional(),
    lines: z
      .array(
        z
          .object({
            inventoryItemId: z.string().min(1),
            quantity: quantitySchema,
            lotId: z.string().min(1).nullable().optional(),
            lotCode: z.string().trim().min(1).max(120).nullable().optional(),
            expiresOn: z.iso.date().nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(250),
  })
  .strict()
  .superRefine((body, context) => {
    const entryReasons = new Set(["initial_inventory", "correction", "internal_recovery", "other"]);
    const exitReasons = new Set([
      "waste",
      "expiration",
      "damage",
      "internal_use",
      "correction",
      "other",
    ]);
    const allowed = body.direction === "entry" ? entryReasons : exitReasons;

    if (!allowed.has(body.reason)) {
      context.addIssue({
        code: "custom",
        message: `Reason ${body.reason} is not valid for ${body.direction}`,
        path: ["reason"],
      });
    }
  });

export const lotsQuerySchema = z
  .object({ inventoryItemId: z.string().min(1).optional() })
  .strict();

export const activationBodySchema = z
  .object({
    previewAcknowledged: z.literal(true),
    confirmZeroBalances: z.boolean().default(false),
  })
  .strict();

export const deactivationBodySchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const updateLocationItemBodySchema = z
  .object({ lowStockThreshold: z.number().min(0).nullable() })
  .strict();

export const createAvailabilityOverrideBodySchema = z
  .object({
    targetType: z.enum(INVENTORY_OVERRIDE_TARGET_TYPES),
    targetId: z.string().min(1),
    reason: z.string().trim().min(1).max(500),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (body) => !body.endsAt || !body.startsAt || body.endsAt > body.startsAt,
    { message: "endsAt must be later than startsAt", path: ["endsAt"] },
  );

export type LocationParams = z.infer<typeof locationParamsSchema>;
export type ItemParams = z.infer<typeof itemParamsSchema>;
export type ProductParams = z.infer<typeof productParamsSchema>;
export type AdjustmentParams = z.infer<typeof adjustmentParamsSchema>;
export type CreateDistributionCenterBody = z.infer<typeof createDistributionCenterBodySchema>;
export type UpdateItemConfigurationBody = z.infer<typeof updateItemConfigurationBodySchema>;
export type UpdateProductConfigurationBody = z.infer<
  typeof updateProductConfigurationBodySchema
>;
export type CreateAdjustmentBody = z.infer<typeof createAdjustmentBodySchema>;
export type LotsQuery = z.infer<typeof lotsQuerySchema>;
export type ActivationBody = z.infer<typeof activationBodySchema>;
export type DeactivationBody = z.infer<typeof deactivationBodySchema>;
export type LocationItemParams = z.infer<typeof locationItemParamsSchema>;
export type OverrideParams = z.infer<typeof overrideParamsSchema>;
export type UpdateLocationItemBody = z.infer<typeof updateLocationItemBodySchema>;
export type CreateAvailabilityOverrideBody = z.infer<
  typeof createAvailabilityOverrideBodySchema
>;
