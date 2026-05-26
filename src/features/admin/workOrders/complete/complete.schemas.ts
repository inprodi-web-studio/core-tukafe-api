import type { z } from "zod";
import { z as zod } from "zod";
import { workOrderResponseSchema } from "../workOrders.schemas";

export const paramsSchema = zod
  .object({
    workOrderId: zod.nanoid(),
  })
  .strict();

export type Params = z.infer<typeof paramsSchema>;

export { workOrderResponseSchema as completeResponseSchema };
