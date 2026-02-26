import { parsePhoneNumberWithError } from "libphonenumber-js";
import { z } from "zod";

export const successResponseSchema = z.object({ success: z.boolean() }).strict();

export const phoneSchema = z.string().refine(
  (value) => {
    try {
      return parsePhoneNumberWithError(value).isValid();
    } catch {
      return false;
    }
  },
  { message: "Invalid phone number format (e.g., +523314328388)" },
);
