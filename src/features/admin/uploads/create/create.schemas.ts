import { uploadVisibilityEnum } from "@core/db/schemas";
import { z } from "zod";

const resizeFitSchema = z.enum(["cover", "contain", "fill", "inside", "outside"]);

export const createMultipartFieldsSchema = z
  .object({
    visibility: z.enum(uploadVisibilityEnum.enumValues).default("PRIVATE"),
    optimizeImage: z.boolean().default(true),
    optimizationQuality: z.number().int().min(1).max(100).default(80),
    maxWidth: z.number().int().positive().optional(),
    maxHeight: z.number().int().positive().optional(),
    fit: resizeFitSchema.default("inside"),
  })
  .strict();

export type CreateMultipartFields = z.infer<typeof createMultipartFieldsSchema>;

const createdUploadSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  visibility: z.enum(uploadVisibilityEnum.enumValues),
  mimeType: z.string(),
  optimized: z.boolean(),
  originalName: z.string(),
  originalMimeType: z.string(),
  originalSizeBytes: z.number().int().nonnegative(),
  storedSizeBytes: z.number().int().nonnegative(),
});

export const createResponseSchema = z.object({
  data: z.array(createdUploadSchema).min(1),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
