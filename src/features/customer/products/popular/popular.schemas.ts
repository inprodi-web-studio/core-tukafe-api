import { z } from "zod";

export const popularQuerySchema = z.object({
  organizationId: z.string().nonempty(),
});

export type PopularQuery = z.infer<typeof popularQuerySchema>;
