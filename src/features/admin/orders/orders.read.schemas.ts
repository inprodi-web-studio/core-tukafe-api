import { createPaginatedResponseSchema } from "@core/utils";
import { orderItemResponseSchema } from "@features/shared/orders/orders.schemas";
import { z } from "zod";

export const adminOrderPaymentStatusSchema = z.enum(["paid", "not_required", "not_recorded"]);
export const adminOrderPreparationStatusSchema = z.enum([
  "scheduled",
  "preparing",
  "ready",
  "no_work",
]);
export const adminOrderSourceSchema = z.enum(["inplace", "mobile", "admin", "unknown"]);

export const adminOrderCustomerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
});

const preparationSummarySchema = z.object({
  status: adminOrderPreparationStatusSchema,
  total: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

const paymentSummarySchema = z.object({
  status: adminOrderPaymentStatusSchema,
  provider: z.enum(["zettle", "stripe"]).nullable(),
});

export const adminOrderListItemSchema = z.object({
  id: z.string(),
  folio: z.string(),
  createdAt: z.date(),
  scheduledFor: z.date().nullable(),
  source: adminOrderSourceSchema,
  customer: adminOrderCustomerSchema.nullable(),
  customerDisplayName: z.string(),
  itemCount: z.number().int().nonnegative(),
  grossSubtotalCents: z.number().int().nonnegative(),
  promotionDiscountCents: z.number().int().nonnegative(),
  couponDiscountCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  cashbackRedemptionCents: z.number().int().nonnegative(),
  amountDueCents: z.number().int().nonnegative(),
  payment: paymentSummarySchema,
  preparation: preparationSummarySchema,
});

export const adminOrdersListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().max(100).optional().nullable(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    paymentStatus: z.enum(["all", "paid", "not_required", "not_recorded"]).default("all"),
    preparationStatus: z.enum(["all", "scheduled", "preparing", "ready", "no_work"]).default("all"),
    source: z.enum(["all", "inplace", "mobile", "admin", "unknown"]).default("all"),
  })
  .strict();

export const adminOrdersListResponseSchema =
  createPaginatedResponseSchema(adminOrderListItemSchema);

export const adminOrderParamsSchema = z.object({ orderId: z.string().trim().min(1) }).strict();

const sanitizedPaymentSchema = z.object({
  id: z.string(),
  provider: z.enum(["zettle", "stripe"]),
  status: z.enum([
    "pending",
    "paid_unlinked",
    "completed",
    "cancelled",
    "failed",
    "requires_reconciliation",
  ]),
  reference: z.string(),
  amountCents: z.number().int().positive(),
  currency: z.string(),
  transactionId: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  cardBrand: z.string().nullable(),
  entryMode: z.string().nullable(),
  authorizationCode: z.string().nullable(),
  obfuscatedPan: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const workOrderVariationSelectionSchema = z.object({
  groupId: z.string(),
  groupName: z.string(),
  groupCustomerLabel: z.string().nullable(),
  optionId: z.string(),
  optionName: z.string(),
  optionKitchenName: z.string().nullable().optional(),
});

const workOrderModifierSchema = z.object({
  modifierId: z.string(),
  modifierName: z.string(),
  modifierKitchenName: z.string().nullable(),
  modifierOptionId: z.string(),
  modifierOptionName: z.string(),
  modifierOptionKitchenName: z.string().nullable(),
  quantity: z.number().positive(),
});

const adminOrderWorkOrderSchema = z.object({
  id: z.string(),
  orderItemId: z.string(),
  productName: z.string(),
  productKitchenName: z.string().nullable(),
  variationName: z.string().nullable(),
  variationSelectionsSnapshot: z.array(workOrderVariationSelectionSchema),
  modifiersSnapshot: z.array(workOrderModifierSchema),
  orderComment: z.string().nullable(),
  itemComment: z.string().nullable(),
  unitIndex: z.number().int().positive(),
  quantitySnapshot: z.number().positive(),
  status: z.enum(["open", "completed"]),
  scheduledFor: z.date().nullable(),
  completedAt: z.date().nullable(),
  completedBy: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  createdAt: z.date(),
});

export const adminOrderDetailSchema = z.object({
  id: z.string(),
  organization: z.object({ id: z.string(), name: z.string() }),
  folio: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  scheduledFor: z.date().nullable(),
  source: adminOrderSourceSchema,
  comment: z.string().nullable(),
  couponCode: z.string().nullable(),
  customer: adminOrderCustomerSchema.nullable(),
  customerDisplayName: z.string(),
  economics: z.object({
    grossSubtotalCents: z.number().int().nonnegative(),
    netSubtotalCents: z.number().int().nonnegative(),
    promotionDiscountCents: z.number().int().nonnegative(),
    couponDiscountCents: z.number().int().nonnegative(),
    discountCents: z.number().int().nonnegative(),
    taxesCents: z.number().int().nonnegative(),
    tipCents: z.number().int().nonnegative(),
    grandTotalCents: z.number().int().nonnegative(),
    cashbackRedemptionCents: z.number().int().nonnegative(),
    cashbackEarnedCents: z.number().int().nonnegative(),
    amountDueCents: z.number().int().nonnegative(),
  }),
  payment: paymentSummarySchema,
  payments: z.array(sanitizedPaymentSchema),
  preparation: preparationSummarySchema,
  items: z.array(orderItemResponseSchema),
  workOrders: z.array(adminOrderWorkOrderSchema),
});

export type AdminOrdersListQuery = z.infer<typeof adminOrdersListQuerySchema>;
export type AdminOrderParams = z.infer<typeof adminOrderParamsSchema>;
export type AdminOrderListItem = z.infer<typeof adminOrderListItemSchema>;
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;
