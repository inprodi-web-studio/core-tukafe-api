import { z } from "zod";

export const paramsSchema = z.object({
  productId: z.nanoid(),
});

export const bodySchema = z
  .object({
    categoryIds: z.array(z.nanoid()).max(100),
  })
  .strict();

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

export const responseSchema = z.object({
  id: z.string(),
  categories: z.array(categorySchema),
});

export type Params = z.infer<typeof paramsSchema>;
export type Body = z.infer<typeof bodySchema>;
