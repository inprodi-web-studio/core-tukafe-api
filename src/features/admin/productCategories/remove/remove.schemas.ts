import { z } from "zod";

export const paramsSchema = z.object({ categoryId: z.string().min(1) }).strict();
export type Params = z.infer<typeof paramsSchema>;
