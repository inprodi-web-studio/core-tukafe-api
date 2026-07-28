import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const cashbackDirectionSchema = z.enum(["credit", "debit"]);
export const cashbackSourceSchema = z.enum(["order", "adjustment"]);
export const cashbackMovementTypeSchema = z.enum([
  "earned",
  "redeemed",
  "adjustment_credit",
  "adjustment_debit",
]);

const customerSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    middleName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  })
  .strict();

const createdBySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    middleName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.email(),
  })
  .strict();

export const cashbackMovementSchema = z
  .object({
    id: z.string(),
    type: cashbackMovementTypeSchema,
    direction: cashbackDirectionSchema,
    source: cashbackSourceSchema,
    amountCents: z.number().int().positive(),
    balanceAfterCents: z.number().int().nonnegative(),
    createdAt: z.date(),
    customer: customerSchema,
    organization: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .strict()
      .nullable(),
    order: z
      .object({
        id: z.string(),
        folio: z.string(),
      })
      .strict()
      .nullable(),
    adjustment: z
      .object({
        reason: z.string(),
        createdBy: createdBySchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().max(100).optional().nullable(),
    direction: cashbackDirectionSchema.optional(),
    source: cashbackSourceSchema.optional(),
    sortBy: z.enum(["createdAt", "customer", "amount", "balanceAfter"]).default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const listResponseSchema = createPaginatedResponseSchema(cashbackMovementSchema);

export const createAdjustmentBodySchema = z
  .object({
    customerId: z.string().trim().min(1),
    direction: cashbackDirectionSchema,
    amountCents: z.number().int().positive().max(2_147_483_647),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const adjustmentResponseSchema = z
  .object({
    id: z.string(),
    customerId: z.string(),
    direction: cashbackDirectionSchema,
    amountCents: z.number().int().positive(),
    balanceBeforeCents: z.number().int().nonnegative(),
    balanceAfterCents: z.number().int().nonnegative(),
    createdAt: z.date(),
  })
  .strict();

export type CashbackListQuery = z.infer<typeof listQuerySchema>;
export type CreateCashbackAdjustmentBody = z.infer<typeof createAdjustmentBodySchema>;
