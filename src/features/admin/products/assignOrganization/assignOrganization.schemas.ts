import { z } from "zod";
import { productResponseSchema } from "../product.schemas";

export const paramsSchema = z.object({
  productId: z.nanoid(),
  organizationId: z.string(),
});

export type Params = z.infer<typeof paramsSchema>;

export const assignOrganizationResponseSchema = productResponseSchema;

export type AssignOrganizationResponse = z.infer<typeof assignOrganizationResponseSchema>;
