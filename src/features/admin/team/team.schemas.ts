import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const teamRoleSchema = z.enum(["admin", "barista"]);

export const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  surnames: z.string(),
  email: z.email(),
  role: teamRoleSchema,
  createdAt: z.date(),
});

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().max(100).optional().nullable(),
    role: teamRoleSchema.optional(),
    sortBy: z.enum(["name", "email", "role", "createdAt"]).default("name"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

export const listResponseSchema = createPaginatedResponseSchema(teamMemberSchema);

export const createBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    surnames: z.string().trim().min(1).max(160),
    email: z.email().transform((value) => value.trim().toLowerCase()),
    password: z.string().min(8).max(128),
    role: teamRoleSchema,
    organizationIds: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(100)
      .transform((values) => [...new Set(values)]),
  })
  .strict();

export type TeamListQuery = z.infer<typeof listQuerySchema>;
export type CreateTeamMemberBody = z.infer<typeof createBodySchema>;
