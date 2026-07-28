import { describe, expect, it } from "vitest";
import { createCampaignBodySchema, scheduleCampaignBodySchema } from "./notifications.schemas";

describe("notification campaign contracts", () => {
  it("accepts supported audiences and destinations", () => {
    expect(
      createCampaignBodySchema.parse({
        scope: "organization",
        title: "2x1 esta tarde",
        body: "Visítanos antes de las 18:00.",
        destination: "home",
      }),
    ).toEqual({
      scope: "organization",
      title: "2x1 esta tarde",
      body: "Visítanos antes de las 18:00.",
      destination: "home",
    });
  });

  it("rejects image and arbitrary-link fields", () => {
    expect(() =>
      createCampaignBodySchema.parse({
        scope: "brand",
        title: "Promoción",
        body: "Conoce la promoción.",
        destination: "home",
        imageUrl: "https://example.com/promo.png",
      }),
    ).toThrow();
  });

  it("normalizes an ISO schedule into a Date", () => {
    const result = scheduleCampaignBodySchema.parse({
      scheduledAt: "2026-07-25T18:00:00.000Z",
    });
    expect(result.scheduledAt).toBeInstanceOf(Date);
  });
});
