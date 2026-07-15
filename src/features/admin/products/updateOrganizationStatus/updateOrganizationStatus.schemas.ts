import { z } from "zod";

export const paramsSchema = z.object({
  productId: z.nanoid(),
});

export const bodySchema = z.object({
  isActive: z.boolean(),
});

export const responseSchema = z.object({
  id: z.string(),
  organizationStatus: z.enum(["active", "inactive"]),
});

export type Params = z.infer<typeof paramsSchema>;
export type Body = z.infer<typeof bodySchema>;
