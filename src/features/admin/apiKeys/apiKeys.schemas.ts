import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const apiKeyStatusSchema = z.enum(["active", "revoked"]);

export const apiKeyListItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  prefix: z.string().nullable(),
  start: z.string().nullable(),
  creator: z.object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  status: apiKeyStatusSchema,
  createdAt: z.date(),
  expiresAt: z.date().nullable(),
  lastRequest: z.date().nullable(),
  requestCount: z.number().int().nonnegative(),
});

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional().nullable(),
    status: z.enum(["all", "active", "revoked"]).default("all"),
  })
  .strict();

export const listResponseSchema = createPaginatedResponseSchema(apiKeyListItemSchema);

export const apiKeyParamsSchema = z.object({ apiKeyId: z.string().trim().min(1) }).strict();

export type ListQuery = z.infer<typeof listQuerySchema>;
export type ApiKeyParams = z.infer<typeof apiKeyParamsSchema>;
