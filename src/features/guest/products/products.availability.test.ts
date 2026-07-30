import { describe, expect, it } from "vitest";
import { hasAvailableCompoundConfiguration } from "./products.availability";

describe("hasAvailableCompoundConfiguration", () => {
  it("keeps a compound when every section has an active option", () => {
    expect(
      hasAvailableCompoundConfiguration(
        [
          { optionProductIds: ["coffee-active", "coffee-inactive"] },
          { optionProductIds: ["bread-active"] },
        ],
        new Set(["coffee-active", "bread-active"]),
      ),
    ).toBe(true);
  });

  it("hides a compound when one section has no active options", () => {
    expect(
      hasAvailableCompoundConfiguration(
        [
          { optionProductIds: ["coffee-active"] },
          { optionProductIds: ["bread-inactive", "bread-unassigned"] },
        ],
        new Set(["coffee-active"]),
      ),
    ).toBe(false);
  });

  it("requires at least two configured sections", () => {
    expect(
      hasAvailableCompoundConfiguration(
        [{ optionProductIds: ["coffee-active"] }],
        new Set(["coffee-active"]),
      ),
    ).toBe(false);
  });
});
