import { z } from "zod";
import { modifierResponseSchema, optionBodySchema } from "../modifiers.schemas";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    kitchenName: z.string().nullish(),
    customerLabel: z.string().nullish(),
    multiSelect: z.boolean().optional(),
    minSelect: z.number().int().min(0).optional(),
    maxSelect: z.number().int().min(0).optional().nullable(),
    options: z.array(optionBodySchema).min(1),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = modifierResponseSchema;

export type CreateResponse = z.infer<typeof createResponseSchema>;
