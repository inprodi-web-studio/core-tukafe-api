import { hasAtMostDecimalPlaces } from "@core/utils";
import { z } from "zod";

const id = z.string().min(1).max(100);
export const countParamsSchema = z.object({ locationId: id, countId: id }).strict();
export const countLocationSchema = z.object({ locationId: id }).strict();
export const countQuantitySchema = z
  .number()
  .min(0)
  .max(999999.999999)
  .refine((n) => hasAtMostDecimalPlaces(n, 6), "La cantidad admite hasta seis decimales");
const observations = z.string().trim().max(1000).nullable().optional();
export const countVersionSchema = z.object({ version: z.number().int().positive() }).strict();
export const createCountSchema = z
  .object({ observations, inventoryItemIds: z.array(id).min(1).max(5000).optional() })
  .strict();
export const saveCountSchema = countVersionSchema
  .extend({
    observations,
    lines: z
      .array(z.object({ id, countedQuantity: countQuantitySchema.nullable() }).strict())
      .max(10000),
  })
  .strict();
export const addCountLotSchema = countVersionSchema
  .extend({
    inventoryItemId: id,
    lotCode: z.string().trim().min(1).max(120).nullable().optional(),
    expiresOn: z.iso.date().nullable().optional(),
  })
  .strict();
export const refreshCountSchema = countVersionSchema
  .extend({ inventoryItemIds: z.array(id).min(1).max(5000) })
  .strict();
export const listCountsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["draft", "applied", "cancelled"]).optional(),
  })
  .strict();

const actor = z.object({ id: z.string(), name: z.string() });
const timestamp = z.iso.datetime();
export const countSummarySchema = z.object({
  id,
  locationId: id,
  status: z.enum(["draft", "applied", "cancelled"]),
  version: z.number().int(),
  observations: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: actor,
  appliedAt: timestamp.nullable(),
  appliedBy: actor.nullable(),
  cancelledAt: timestamp.nullable(),
  cancelledBy: actor.nullable(),
  movementId: z.string().nullable(),
});
export const countSnapshotSchema = z.object({
  id,
  kind: z.enum(["ingredient", "supply", "product", "variation"]),
  name: z.string(),
  isTracked: z.boolean(),
  tracksLots: z.boolean(),
  isPerishable: z.boolean(),
  unit: z.object({ id, name: z.string(), abbreviation: z.string(), precision: z.number().int() }),
});
export const countLineSchema = z.object({
  id,
  lotId: z.string().nullable(),
  lotCode: z.string().nullable(),
  expiresOn: z.string().nullable(),
  systemQuantity: z.number(),
  countedQuantity: z.number().nullable(),
  previousCountedQuantity: z.number().nullable(),
  appliedDelta: z.number().nullable(),
});
export const countDetailSchema = countSummarySchema.extend({
  items: z.array(
    z.object({
      id,
      inventoryItemId: id,
      snapshot: countSnapshotSchema,
      referenceAt: timestamp,
      hasConflict: z.boolean(),
      reservedQuantity: z.number(),
      lines: z.array(countLineSchema),
    }),
  ),
});
export const countListResponseSchema = z.object({
  data: z.array(countSummarySchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});

export type CreateCountBody = z.infer<typeof createCountSchema>;
export type SaveCountBody = z.infer<typeof saveCountSchema>;
export type AddCountLotBody = z.infer<typeof addCountLotSchema>;
export type RefreshCountBody = z.infer<typeof refreshCountSchema>;
export type CountVersionBody = z.infer<typeof countVersionSchema>;
export type CountParams = z.infer<typeof countParamsSchema>;
export type CountLocation = z.infer<typeof countLocationSchema>;
export type ListCountsQuery = z.infer<typeof listCountsSchema>;
export type CountDetail = z.infer<typeof countDetailSchema>;
export type CountSummary = z.infer<typeof countSummarySchema>;
export type CountList = z.infer<typeof countListResponseSchema>;
