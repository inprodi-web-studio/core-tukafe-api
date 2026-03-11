import { createPaginatedResponseSchema } from "@core/utils";
import { productResponseSchema } from "../product.schemas";

export const listResponseSchema = createPaginatedResponseSchema(productResponseSchema);
