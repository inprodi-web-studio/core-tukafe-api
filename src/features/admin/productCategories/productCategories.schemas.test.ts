import { describe, expect, it } from "vitest";
import { createBodySchema } from "./create/create.schemas";
import { listResponseSchema } from "./list/list.schemas";
import { orderBodySchema } from "./order/order.schemas";
import { updateBodySchema } from "./update/update.schemas";

describe("product category schemas", () => {
  it("requires an image and defaults icon handling to the service", () => {
    const input = {
      name: "Bebidas",
      color: "#83987E",
      imageUploadId: "image-category",
    };

    expect(createBodySchema.parse(input)).toEqual(input);
    expect(() => createBodySchema.parse({ name: "Bebidas", color: "#83987E" })).toThrow();
  });

  it("rejects clearing the image on update", () => {
    expect(() => updateBodySchema.parse({ imageUploadId: null })).toThrow();
    expect(updateBodySchema.parse({ imageUploadId: "replacement-image" })).toEqual({
      imageUploadId: "replacement-image",
    });
  });

  it("accepts only directional reordering", () => {
    expect(orderBodySchema.parse({ direction: "up" })).toEqual({ direction: "up" });
    expect(() => orderBodySchema.parse({ direction: "first" })).toThrow();
  });

  it("exposes parentId on every tree node", () => {
    const response = {
      data: [
        {
          id: "root",
          parentId: null,
          name: "Bebidas",
          icon: "CircleDashedIcon",
          color: "#83987E",
          sortOrder: 0,
          isFourPlusOneEligible: false,
          isCashbackEligible: true,
          image: null,
          children: [
            {
              id: "child",
              parentId: "root",
              name: "Frías",
              icon: "CircleDashedIcon",
              color: "#83987E",
              sortOrder: 0,
              isFourPlusOneEligible: false,
              isCashbackEligible: false,
              image: null,
              children: [],
            },
          ],
        },
      ],
      pagination: { page: 1, pageSize: 30, totalItems: 1, totalPages: 1 },
    };

    expect(listResponseSchema.parse(response)).toEqual(response);
  });
});
