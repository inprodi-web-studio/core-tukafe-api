import { z } from "zod";
import { customerSchema } from "../findOrCreate/findOrCreate.schemas";

export const identifyWithQrBodySchema = z
  .object({
    payload: z.string().trim().min(1),
  })
  .strict();

export type IdentifyWithQrBody = z.infer<typeof identifyWithQrBodySchema>;

export const identifyWithQrResponseSchema = z
  .object({
    customer: customerSchema,
  })
  .strict();

export type IdentifyWithQrResponse = z.infer<typeof identifyWithQrResponseSchema>;
