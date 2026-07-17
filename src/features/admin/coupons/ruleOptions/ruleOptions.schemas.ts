import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const querySchema = z
  .object({
    resource: z.enum(["product", "category"]),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional().nullable(),
    ids: z
      .string()
      .trim()
      .optional()
      .transform((value) =>
        value
          ? [
              ...new Set(
                value
                  .split(",")
                  .map((id) => id.trim())
                  .filter(Boolean),
              ),
            ].slice(0, 100)
          : undefined,
      ),
  })
  .strict();

export const responseSchema = createPaginatedResponseSchema(
  z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().nullable(),
  }),
);

export type Query = z.infer<typeof querySchema>;
