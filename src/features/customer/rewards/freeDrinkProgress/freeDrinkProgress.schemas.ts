import { z } from "zod";

export const freeDrinkProgressResponseSchema = z.object({
  progressCount: z.number().int().min(0).max(4),
  candidateProductIds: z.array(z.string()),
  eligibleForFreeDrink: z.boolean(),
});

export type FreeDrinkProgressResponse = z.infer<typeof freeDrinkProgressResponseSchema>;
