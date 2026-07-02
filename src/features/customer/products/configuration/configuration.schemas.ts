import { z } from "zod";
import {
  configurationResponseSchema as guestConfigurationResponseSchema,
  paramsSchema,
} from "@features/guest/products/configuration/configuration.schemas";

export { paramsSchema };

export const configurationResponseSchema = guestConfigurationResponseSchema.extend({
  isFavorite: z.boolean(),
});

export type Params = z.infer<typeof paramsSchema>;
export type ConfigurationResponse = z.infer<typeof configurationResponseSchema>;
