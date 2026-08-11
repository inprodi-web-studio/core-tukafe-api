import { describe, expect, it } from "vitest";
import {
  buildProductCategoryTree,
  normalizeProductCategoryInput,
} from "./productCategories.helpers";

describe("product category helpers", () => {
  it("uses a generic icon and normalizes category input", () => {
    expect(
      normalizeProductCategoryInput({
        name: "  Bebidas   frías ",
        color: "#aabbcc",
        imageUploadId: "image-id",
      }),
    ).toEqual({
      name: "Bebidas frías",
      icon: "CircleDashedIcon",
      color: "#AABBCC",
      sortOrder: 0,
      isFourPlusOneEligible: false,
      isCashbackEligible: false,
      imageUploadId: "image-id",
      parentId: null,
    });
  });

  it("preserves parent identifiers while building an arbitrary-depth tree", () => {
    const common = {
      icon: "CircleDashedIcon",
      color: "#AABBCC",
      sortOrder: 0,
      isFourPlusOneEligible: false,
      isCashbackEligible: false,
      image: null,
    };
    const tree = buildProductCategoryTree([
      { ...common, id: "root", parentId: null, name: "Bebidas" },
      { ...common, id: "child", parentId: "root", name: "Frías" },
      { ...common, id: "grandchild", parentId: "child", name: "Sin café" },
    ]);

    expect(tree[0]?.parentId).toBeNull();
    expect(tree[0]?.children[0]?.parentId).toBe("root");
    expect(tree[0]?.children[0]?.children[0]?.parentId).toBe("child");
  });
});
