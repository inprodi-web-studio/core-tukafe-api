import type { FastifyInstance } from "fastify";
import type { CustomerAuthService } from "./auth.types";

export function customerAuthService(fastify: FastifyInstance): CustomerAuthService {
  return {};
}
