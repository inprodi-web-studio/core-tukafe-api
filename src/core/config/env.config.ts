import { z } from "zod";

const booleanEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") {
      return defaultValue;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (normalized === "true") {
        return true;
      }

      if (normalized === "false") {
        return false;
      }
    }

    return value;
  }, z.boolean());

const certificateEnv = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(/\\n/g, "\n");

  return normalized.length > 0 ? normalized : undefined;
}, z.string().optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_URL: z.url(),
    API_URL: z.url(),
    HOST: z.string().nonempty().default("0.0.0.0"),
    DATABASE_URL: z.string().nonempty(),
    DATABASE_SSL_REJECT_UNAUTHORIZED: booleanEnv(true),
    DATABASE_SSL_CA_CERT: certificateEnv,
    BETTER_AUTH_SECRET: z.string().min(32),
    TWILIO_ACCOUNT_SID: z
      .string()
      .trim()
      .regex(/^AC[a-fA-F0-9]{32}$/, "TWILIO_ACCOUNT_SID must be a valid Twilio Account SID"),
    TWILIO_AUTH_TOKEN: z.string().trim().min(1),
    TWILIO_FROM_PHONE_NUMBER: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{1,14}$/, "TWILIO_FROM_PHONE_NUMBER must be in E.164 format"),
    GCP_PROJECT_ID: z.string().trim().optional(),
    GCP_CLIENT_EMAIL: z.string().trim().optional(),
    GCP_PRIVATE_KEY: z.string().trim().optional(),
    GCS_PUBLIC_BUCKET: z.string().trim().optional(),
    GCS_PRIVATE_BUCKET: z.string().trim().optional(),
    GCS_UPLOADS_PREFIX: z.string().trim().default("uploads"),
    FIREBASE_PROJECT_ID: z.string().trim().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().trim().optional(),
    FIREBASE_PRIVATE_KEY: certificateEnv,
    NOTIFICATION_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
    NOTIFICATION_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
    STRIPE_SECRET_KEY: z.string().trim().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().trim().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().trim().optional(),
    STRIPE_MERCHANT_COUNTRY_CODE: z.string().trim().length(2).default("MX"),
    STRIPE_APPLE_MERCHANT_ID: z.string().trim().optional(),
    STRIPE_GOOGLE_PAY_ENABLED: booleanEnv(true),
    STRIPE_GOOGLE_PAY_TEST_ENV: booleanEnv(true),
    UPLOAD_MAX_FILES_PER_REQUEST: z.coerce.number().int().min(1).max(100).default(10),
    UPLOAD_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .default(10 * 1024 * 1024),
  })
  .superRefine((input, ctx) => {
    const hasClientEmail = Boolean(input.GCP_CLIENT_EMAIL);
    const hasPrivateKey = Boolean(input.GCP_PRIVATE_KEY);

    if (hasClientEmail !== hasPrivateKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GCP_CLIENT_EMAIL"],
        message: "GCP_CLIENT_EMAIL and GCP_PRIVATE_KEY must be provided together",
      });
    }

    const firebaseCredentials = [
      input.FIREBASE_PROJECT_ID,
      input.FIREBASE_CLIENT_EMAIL,
      input.FIREBASE_PRIVATE_KEY,
    ];
    const configuredFirebaseCredentials = firebaseCredentials.filter(Boolean).length;

    if (configuredFirebaseCredentials !== 0 && configuredFirebaseCredentials !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FIREBASE_PROJECT_ID"],
        message:
          "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be provided together",
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
