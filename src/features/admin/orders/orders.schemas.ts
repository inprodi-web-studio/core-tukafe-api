import { MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const orderItemModifierResponseSchema = z.object({
  id: z.string(),
  modifierId: z.string(),
  modifierOptionId: z.string(),
  modifierName: z.string(),
  modifierOptionName: z.string(),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalPriceCents: z.number().int().nonnegative(),
  sortOrder: z.number().int().min(0),
});

export const orderItemTaxResponseSchema = z.object({
  taxId: z.string(),
  taxName: z.string(),
  taxRate: z.number().int().min(0).max(10000),
  taxAmountCents: z.number().int().nonnegative(),
});

export const orderItemResponseSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variationId: z.string().nullable(),
  unitId: z.string(),
  productName: z.string(),
  variationName: z.string().nullable(),
  unitName: z.string(),
  unitAbbreviation: z.string(),
  unitPrecision: z.number().int().min(0).max(MAX_SUPPORTED_DECIMAL_PLACES),
  quantity: z.number().positive(),
  comment: z.string().nullable(),
  unitPriceCents: z.number().int().nonnegative(),
  modifiersSubtotalCents: z.number().int().nonnegative(),
  subtotalCents: z.number().int().nonnegative(),
  taxesCents: z.number().int().nonnegative(),
  grandTotalCents: z.number().int().nonnegative(),
  sortOrder: z.number().int().min(0),
  modifiers: z.array(orderItemModifierResponseSchema),
  taxes: z.array(orderItemTaxResponseSchema),
});

export const orderResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  customerId: z.string(),
  folio: z.string(),
  comment: z.string().nullable(),
  subtotalCents: z.number().int().nonnegative(),
  taxesCents: z.number().int().nonnegative(),
  grandTotalCents: z.number().int().nonnegative(),
  customer: z.object({
    id: z.string(),
    name: z.string(),
    middleName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string(),
    phoneNumber: z.string().nullable(),
  }),
  items: z.array(orderItemResponseSchema),
});
