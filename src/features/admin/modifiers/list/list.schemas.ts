import type { z } from "zod";
import { listQueryParamsSchema, listResponseSchema } from "../modifiers.schemas";

export { listQueryParamsSchema, listResponseSchema };

export type ListQueryParams = z.infer<typeof listQueryParamsSchema>;
export type ListResponse = z.infer<typeof listResponseSchema>;
