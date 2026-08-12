import { describe, expect, it } from "vitest";
import { createBodySchema } from "./create/create.schemas";
import { apiKeyParamsSchema, listQuerySchema } from "./apiKeys.schemas";

describe("API key schemas", () => {
  it("applies global list defaults", () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, status: "all" });
  });

  it("accepts supported list filters and rejects unknown ones", () => {
    expect(listQuerySchema.parse({ status: "revoked", search: "barra" })).toMatchObject({
      status: "revoked",
      search: "barra",
    });
    expect(() => listQuerySchema.parse({ status: "expired" })).toThrow();
  });

  it("accepts no expiry or a value between one and 365 days", () => {
    expect(createBodySchema.parse({ name: "iPad" })).toEqual({ name: "iPad" });
    expect(createBodySchema.parse({ name: "iPad", expiresInSeconds: 86_400 })).toEqual({
      name: "iPad",
      expiresInSeconds: 86_400,
    });
    expect(() => createBodySchema.parse({ name: "iPad", expiresInSeconds: 86_399 })).toThrow();
    expect(() => createBodySchema.parse({ name: "iPad", expiresInSeconds: 31_536_001 })).toThrow();
  });

  it("requires a non-empty API key id", () => {
    expect(apiKeyParamsSchema.parse({ apiKeyId: "key-1" })).toEqual({ apiKeyId: "key-1" });
    expect(() => apiKeyParamsSchema.parse({ apiKeyId: "" })).toThrow();
  });
});
