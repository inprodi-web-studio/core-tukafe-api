import { env } from "@core/config/env.config";

// Fastify CORS and Better Auth must trust the same frontend origins.
export const TRUSTED_ORIGINS = [env.PUBLIC_URL, env.API_URL].filter(
  (origin, index, values): origin is string => Boolean(origin) && values.indexOf(origin) === index,
);
