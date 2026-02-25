import { z } from "zod";

export const signupBodySchema = z.object({});

export type SignupBody = z.infer<typeof signupBodySchema>;

export const signupResponseSchema = z.object({});

export type SignupResponse = z.infer<typeof signupResponseSchema>;
