import { z } from "zod";

export const listItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  address: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export const listResponseSchema = z.array(listItemSchema);

export const nearestQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const nearestResponseSchema = z.object({
  organization: listItemSchema.nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
});

export type ListResponse = z.infer<typeof listResponseSchema>;
export type NearestQuery = z.infer<typeof nearestQuerySchema>;
export type NearestResponse = z.infer<typeof nearestResponseSchema>;
