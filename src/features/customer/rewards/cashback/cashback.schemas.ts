import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const cashbackSummaryResponseSchema = z
  .object({
    balanceCents: z.number().int().nonnegative(),
    totalEarnedCents: z.number().int().nonnegative(),
    totalRedeemedCents: z.number().int().nonnegative(),
  })
  .strict();

export type CashbackSummaryResponse = z.infer<typeof cashbackSummaryResponseSchema>;

export const cashbackMovementsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type CashbackMovementsQuery = z.infer<typeof cashbackMovementsQuerySchema>;

export const cashbackMovementSchema = z
  .object({
    id: z.string(),
    type: z.enum(["earned", "redeemed"]),
    amountCents: z.number().int().positive(),
    balanceAfterCents: z.number().int().nonnegative(),
    organizationId: z.string(),
    createdAt: z.date(),
    order: z
      .object({
        id: z.string(),
        folio: z.string(),
      })
      .strict(),
  })
  .strict();

export const cashbackMovementsResponseSchema =
  createPaginatedResponseSchema(cashbackMovementSchema);

export type CashbackMovementResponse = z.infer<typeof cashbackMovementSchema>;
export type CashbackMovementsResponse = z.infer<typeof cashbackMovementsResponseSchema>;
