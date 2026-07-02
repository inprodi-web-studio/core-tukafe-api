import { listItemSchema } from "@features/guest/organizations/list/list.schemas";
import { z } from "zod";

export const paramsSchema = z.object({
  organizationId: z.string(),
});

export const updateLocationBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const updateLocationResponseSchema = listItemSchema;

export type Params = z.infer<typeof paramsSchema>;
export type UpdateLocationBody = z.infer<typeof updateLocationBodySchema>;
export type UpdateLocationResponse = z.infer<typeof updateLocationResponseSchema>;
