import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const customerSortFieldSchema = z.enum([
  "name",
  "phone",
  "email",
  "orderCount",
  "lastOrderAt",
  "createdAt",
]);

export const customerListItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  cashbackBalanceCents: z.number().int().nonnegative(),
  orderCount: z.number().int().min(0),
  lastOrderAt: z.date().nullable(),
  createdAt: z.date(),
});

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().max(100).optional().nullable(),
    sortBy: customerSortFieldSchema.default("lastOrderAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export const listResponseSchema = createPaginatedResponseSchema(customerListItemSchema);

export type CustomerListQuery = z.infer<typeof listQuerySchema>;
