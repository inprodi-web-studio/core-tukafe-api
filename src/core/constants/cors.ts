import { env } from "@core/config/env.config";

export const TRUSTED_ORIGINS = [env.PUBLIC_URL, env.API_URL].filter(
  (origin, index, values): origin is string => Boolean(origin) && values.indexOf(origin) === index,
);
