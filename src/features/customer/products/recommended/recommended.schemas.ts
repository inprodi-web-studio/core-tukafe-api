import { z } from "zod";

export const recommendedQuerySchema = z.object({
  organizationId: z.string().nonempty(),
});

export type RecommendedQuery = z.infer<typeof recommendedQuerySchema>;
