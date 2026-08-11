import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must use lowercase letters, numbers and hyphens");

const coordinatesShape = {
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
};

function validateCoordinates(
  value: { latitude?: number | null; longitude?: number | null },
  context: z.RefinementCtx,
) {
  const hasLatitude = Object.hasOwn(value, "latitude");
  const hasLongitude = Object.hasOwn(value, "longitude");

  if (hasLatitude !== hasLongitude || (value.latitude === null) !== (value.longitude === null)) {
    context.addIssue({
      code: "custom",
      message: "Latitude and longitude must be provided together",
      path: hasLatitude ? ["longitude"] : ["latitude"],
    });
  }
}

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  address: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional().nullable(),
    status: z.enum(["all", "active", "inactive"]).default("all"),
  })
  .strict();

export const listResponseSchema = createPaginatedResponseSchema(organizationSchema);

export const createBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug: slugSchema,
    address: z.string().trim().min(1).max(500),
    logoUploadId: z.string().trim().min(1).nullable().optional(),
    ...coordinatesShape,
  })
  .strict()
  .superRefine(validateCoordinates);

export const updateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    slug: slugSchema.optional(),
    address: z.string().trim().min(1).max(500).optional(),
    logoUploadId: z.string().trim().min(1).nullable().optional(),
    ...coordinatesShape,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" })
  .superRefine(validateCoordinates);

export const paramsSchema = z.object({ organizationId: z.string().trim().min(1) }).strict();

export type ListQuery = z.infer<typeof listQuerySchema>;
export type CreateBody = z.infer<typeof createBodySchema>;
export type UpdateBody = z.infer<typeof updateBodySchema>;
export type Params = z.infer<typeof paramsSchema>;
