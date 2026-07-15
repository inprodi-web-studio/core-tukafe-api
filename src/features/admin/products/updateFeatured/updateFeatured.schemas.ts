import { z } from "zod";

export const paramsSchema = z.object({
  productId: z.nanoid(),
});

export const bodySchema = z.object({
  isFeatured: z.boolean(),
});

export const responseSchema = z.object({
  id: z.string(),
  isFeatured: z.boolean(),
});

export type Params = z.infer<typeof paramsSchema>;
export type Body = z.infer<typeof bodySchema>;
