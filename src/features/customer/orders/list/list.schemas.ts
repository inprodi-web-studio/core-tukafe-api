import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const listCustomerOrdersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type ListCustomerOrdersQuery = z.infer<typeof listCustomerOrdersQuerySchema>;

export const customerOrderSummarySchema = z
  .object({
    id: z.string(),
    folio: z.string(),
    createdAt: z.date(),
    grandTotalCents: z.number().int().nonnegative(),
    organization: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .strict(),
  })
  .strict();

export const listCustomerOrdersResponseSchema = createPaginatedResponseSchema(
  customerOrderSummarySchema,
);

export type CustomerOrderSummary = z.infer<typeof customerOrderSummarySchema>;
export type ListCustomerOrdersResponse = z.infer<typeof listCustomerOrdersResponseSchema>;
