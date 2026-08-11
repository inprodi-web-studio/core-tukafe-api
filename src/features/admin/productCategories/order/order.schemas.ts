import { z } from "zod";

export const paramsSchema = z.object({ categoryId: z.string().min(1) }).strict();
export const orderBodySchema = z.object({ direction: z.enum(["up", "down"]) }).strict();

export type Params = z.infer<typeof paramsSchema>;
export type OrderBody = z.infer<typeof orderBodySchema>;
