import { z } from "zod";
import {
  configurationResponseSchema as guestConfigurationResponseSchema,
  paramsSchema,
  querySchema,
} from "@features/guest/products/configuration/configuration.schemas";

export { paramsSchema, querySchema };

export const configurationResponseSchema = guestConfigurationResponseSchema.extend({
  isFavorite: z.boolean(),
});

export type Params = z.infer<typeof paramsSchema>;
export type Query = z.infer<typeof querySchema>;
export type ConfigurationResponse = z.infer<typeof configurationResponseSchema>;
