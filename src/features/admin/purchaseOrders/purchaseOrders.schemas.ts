import { PURCHASE_ORDER_STATUSES } from "@core/db/schemas";
import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const quantitySchema = z
  .number()
  .positive()
  .refine((value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES), {
    message: `Quantity supports at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
  });

export const purchaseOrderParamsSchema = z
  .object({ purchaseOrderId: z.string().trim().min(1) })
  .strict();
export const receiptParamsSchema = purchaseOrderParamsSchema
  .extend({ receiptId: z.string().trim().min(1) })
  .strict();
export const supplierCatalogQuerySchema = z
  .object({ supplierId: z.string().trim().min(1) })
  .strict();

export const purchaseOrderLineInputSchema = z
  .object({
    presentationId: z.string().trim().min(1),
    quantity: quantitySchema,
    unitPriceCents: z.number().int().min(0),
    taxIds: z.array(z.string().trim().min(1)).max(20).default([]),
  })
  .strict();

export const purchaseOrderDraftBodySchema = z
  .object({
    supplierId: z.string().trim().min(1),
    locationId: z.string().trim().min(1),
    quoteReference: nullableText(160),
    observations: nullableText(1000),
    expectedDeliveryOn: z.iso.date().nullable().optional(),
    lines: z.array(purchaseOrderLineInputSchema).max(250).default([]),
  })
  .strict()
  .superRefine((body, context) => {
    const presentations = new Set<string>();
    for (const [index, line] of body.lines.entries()) {
      if (presentations.has(line.presentationId)) {
        context.addIssue({
          code: "custom",
          message: "A presentation can only appear once in a purchase order",
          path: ["lines", index, "presentationId"],
        });
      }
      presentations.add(line.presentationId);
      if (new Set(line.taxIds).size !== line.taxIds.length) {
        context.addIssue({
          code: "custom",
          message: "Tax ids must be unique",
          path: ["lines", index, "taxIds"],
        });
      }
    }
  });

export const purchaseOrderListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).nullable().optional(),
    status: z.enum(["all", ...PURCHASE_ORDER_STATUSES]).default("all"),
    supplierId: z.string().trim().min(1).nullable().optional(),
    locationId: z.string().trim().min(1).nullable().optional(),
    dateFrom: z.iso.date().nullable().optional(),
    dateTo: z.iso.date().nullable().optional(),
  })
  .strict()
  .refine((body) => !body.dateFrom || !body.dateTo || body.dateTo >= body.dateFrom, {
    message: "dateTo must be on or after dateFrom",
    path: ["dateTo"],
  });

export const metadataBodySchema = z
  .object({
    expectedDeliveryOn: z.iso.date().nullable().optional(),
    observations: nullableText(1000),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "At least one field is required");

export const reasonBodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const receiptAllocationSchema = z
  .object({
    purchaseOrderItemId: z.string().trim().min(1),
    presentationQuantity: quantitySchema,
    lotCode: nullableText(120),
    expiresOn: z.iso.date().nullable().optional(),
  })
  .strict();

export const receiptBodySchema = z
  .object({
    receivedOn: z.iso.date(),
    supplierDocumentReference: nullableText(160),
    observations: nullableText(1000),
    allocations: z.array(receiptAllocationSchema).min(1).max(500),
  })
  .strict();

export const correctionBodySchema = receiptBodySchema
  .extend({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type PurchaseOrderParams = z.infer<typeof purchaseOrderParamsSchema>;
export type ReceiptParams = z.infer<typeof receiptParamsSchema>;
export type SupplierCatalogQuery = z.infer<typeof supplierCatalogQuerySchema>;
export type PurchaseOrderDraftBody = z.infer<typeof purchaseOrderDraftBodySchema>;
export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;
export type MetadataBody = z.infer<typeof metadataBodySchema>;
export type ReasonBody = z.infer<typeof reasonBodySchema>;
export type ReceiptBody = z.infer<typeof receiptBodySchema>;
export type CorrectionBody = z.infer<typeof correctionBodySchema>;
