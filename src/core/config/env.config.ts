import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.url(),
  API_URL: z.url(),
  HOST: z.string().nonempty().default("0.0.0.0"),
  DATABASE_URL: z.string().nonempty(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GCP_PROJECT_ID: z.string().trim().optional(),
  GCP_CLIENT_EMAIL: z.string().trim().optional(),
  GCP_PRIVATE_KEY: z.string().trim().optional(),
  GCS_PUBLIC_BUCKET: z.string().trim().optional(),
  GCS_PRIVATE_BUCKET: z.string().trim().optional(),
  GCS_UPLOADS_PREFIX: z.string().trim().default("uploads"),
  UPLOAD_MAX_FILES_PER_REQUEST: z.coerce.number().int().min(1).max(100).default(10),
  UPLOAD_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024)
    .default(10 * 1024 * 1024),
}).superRefine((input, ctx) => {
  const hasClientEmail = Boolean(input.GCP_CLIENT_EMAIL);
  const hasPrivateKey = Boolean(input.GCP_PRIVATE_KEY);

  if (hasClientEmail !== hasPrivateKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GCP_CLIENT_EMAIL"],
      message: "GCP_CLIENT_EMAIL and GCP_PRIVATE_KEY must be provided together",
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join(", ");
  throw new Error(`Invalid environment variables: ${issues}`);
}

export const env = parsed.data;
