import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

const workOrderModifierSnapshotSchema = z.object({
  modifierId: z.string(),
  modifierName: z.string(),
  modifierKitchenName: z.string().nullable(),
  modifierOptionId: z.string(),
  modifierOptionName: z.string(),
  modifierOptionKitchenName: z.string().nullable(),
  quantity: z.number().positive(),
});

const workOrderVariationSelectionSnapshotSchema = z.object({
  groupId: z.string(),
  groupName: z.string(),
  groupCustomerLabel: z.string().nullable(),
  optionId: z.string(),
  optionName: z.string(),
  optionKitchenName: z.string().nullable().optional(),
});

const workOrderProductImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  mimeType: z.string(),
});

export const workOrderResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  orderId: z.string(),
  orderItemId: z.string(),
  orderFolio: z.string(),
  customerDisplayName: z.string().nullable(),
  productName: z.string(),
  productKitchenName: z.string().nullable(),
  variationName: z.string().nullable(),
  variationSelectionsSnapshot: z.array(workOrderVariationSelectionSnapshotSchema),
  modifiersSnapshot: z.array(workOrderModifierSnapshotSchema),
  orderComment: z.string().nullable(),
  itemComment: z.string().nullable(),
  unitIndex: z.number().int().positive(),
  quantitySnapshot: z.number().positive(),
  status: z.enum(["open", "completed"]),
  scheduledFor: z.date().nullable(),
  completedAt: z.date().nullable(),
  completedByUserId: z.string().nullable(),
  productImage: workOrderProductImageSchema.nullable().optional(),
  comboName: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const workOrderListStatusSchema = z.enum(["open", "completed", "all"]);

export const workOrderListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().optional().nullable(),
    status: workOrderListStatusSchema.optional(),
  })
  .strict();

export const workOrderListResponseSchema = createPaginatedResponseSchema(workOrderResponseSchema);
