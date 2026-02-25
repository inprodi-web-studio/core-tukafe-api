export interface AdminNamespace extends Record<string, unknown> {
  readonly __adminNamespaceBrand__?: never;
}

export interface CustomerNamespace extends Record<string, unknown> {
  readonly __customerNamespaceBrand__?: never;
}

declare module "fastify" {
  interface FastifyInstance {
    admin: AdminNamespace;
    customer: CustomerNamespace;
  }
}
