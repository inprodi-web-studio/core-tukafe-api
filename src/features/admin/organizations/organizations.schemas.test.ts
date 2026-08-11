import { describe, expect, it } from "vitest";
import { createBodySchema, listQuerySchema, updateBodySchema } from "./organizations.schemas";

describe("organization schemas", () => {
  it("applies global list defaults", () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, status: "all" });
  });

  it("accepts an optional complete coordinate pair", () => {
    expect(
      createBodySchema.parse({
        name: "Norte",
        slug: "norte",
        address: "Av. Norte 10",
        latitude: 20.67,
        longitude: -103.4,
      }),
    ).toMatchObject({ latitude: 20.67, longitude: -103.4 });
  });

  it("rejects incomplete coordinates", () => {
    expect(() =>
      createBodySchema.parse({
        name: "Norte",
        slug: "norte",
        address: "Av. Norte 10",
        latitude: 20.67,
      }),
    ).toThrow();
    expect(() => updateBodySchema.parse({ longitude: null })).toThrow();
  });

  it("requires a valid slug and at least one update field", () => {
    expect(() =>
      createBodySchema.parse({ name: "Norte", slug: "Sucursal Norte", address: "Norte" }),
    ).toThrow();
    expect(() => updateBodySchema.parse({})).toThrow();
    expect(updateBodySchema.parse({ logoUploadId: null })).toEqual({ logoUploadId: null });
  });
});
