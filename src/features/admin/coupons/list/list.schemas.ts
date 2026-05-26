import type { z } from "zod";
import { listQuerySchema, listResponseSchema } from "../coupons.schemas";

export const querySchema = listQuerySchema;
export type QueryParams = z.infer<typeof querySchema>;

export { listResponseSchema };
export type ListResponse = z.infer<typeof listResponseSchema>;
