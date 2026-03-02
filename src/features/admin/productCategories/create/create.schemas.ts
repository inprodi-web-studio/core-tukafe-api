import { colorSchema } from "@core/utils";
import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    icon: z.string().nonempty(),
    color: colorSchema,
    parentId: z.string().nullish(),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  parentId: z.string().nullish(),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
