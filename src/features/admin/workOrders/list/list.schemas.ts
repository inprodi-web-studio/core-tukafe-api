import type { z } from "zod";
import { workOrderListQuerySchema, workOrderListResponseSchema } from "../workOrders.schemas";

export const querySchema = workOrderListQuerySchema;
export type QueryParams = z.infer<typeof querySchema>;

export { workOrderListResponseSchema as listResponseSchema };
