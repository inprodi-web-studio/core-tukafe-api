import { variationsDB } from "@core/db/schemas";
import type {
  orderItemModifiersDB,
  orderItemsDB,
  orderItemTaxesDB,
  WorkOrderModifierSnapshot,
  WorkOrderVariationSelectionSnapshot,
} from "@core/db/schemas";
import {
  assertUniqueValues,
  generateNanoId,
  hasAtMostDecimalPlaces,
  MAX_SUPPORTED_DECIMAL_PLACES,
  notFound,
  validation,
} from "@core/utils";
import { and, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  calculateIncludedTaxBreakdown,
  calculateExtendedPriceCents,
  resolveVariationName,
} from "./orders.helpers";
import type { NormalizedCreateOrderItemParams } from "./orders.types";

type OrderItemInsert = typeof orderItemsDB.$inferInsert;
type OrderItemModifierInsert = typeof orderItemModifiersDB.$inferInsert;
type OrderItemTaxInsert = typeof orderItemTaxesDB.$inferInsert;

interface ProductModifierConfig {
  id: string;
  name: string;
  kitchenName: string | null;
  minSelect: number;
  maxSelect: number | null;
  multiSelect: boolean;
  sortOrder: number;
}

interface ModifierOptionLookupValue {
  modifierId: string;
  modifierName: string;
  modifierKitchenName: string | null;
  optionId: string;
  optionName: string;
  optionKitchenName: string | null;
  optionPriceCents: number;
}

interface ProductLookup {
  id: string;
  name: string;
  kitchenName: string | null;
  priceCents: number | null;
  categoryId: string | null;
  category: {
    isFourPlusOneEligible: boolean;
  } | null;
  unit: {
    id: string;
    name: string;
    abbreviation: string;
    precision: number;
  };
  taxes: Array<{
    tax: {
      id: string;
      name: string;
      rate: number;
    };
  }>;
}

interface SelectedVariationLookup {
  id: string;
  productId: string;
  priceCents: number;
  kitchenName: string | null;
  customerDescription: string | null;
  selections: Array<{
    group: {
      id: string;
      name: string;
      customerLabel: string | null;
      sortOrder: number;
    };
    option: {
      id: string;
      name: string;
    };
  }>;
}

interface OrderValidationContext {
  productsById: Map<string, ProductLookup>;
  selectedVariationsById: Map<string, SelectedVariationLookup>;
  variationIdsByProductId: Map<string, Set<string>>;
  productModifierConfigsByProductId: Map<string, ProductModifierConfig[]>;
  modifierOptionLookupByProductId: Map<string, Map<string, ModifierOptionLookupValue>>;
}

export interface PreparedOrderItem {
  item: Omit<OrderItemInsert, "orderId">;
  modifiers: OrderItemModifierInsert[];
  taxes: OrderItemTaxInsert[];
  workOrderSnapshot: {
    productKitchenName: string | null;
    variationSelections: WorkOrderVariationSelectionSnapshot[];
    modifiers: WorkOrderModifierSnapshot[];
  };
  isPromotionEligible: boolean;
  productCategoryId: string | null;
  sourceClientItemId: string | null;
  requestedRedeemFreeUnits: number;
  lineType: "paid" | "free";
  displayUnitPriceCents: number;
}

export interface PreparedOrderPayload {
  items: PreparedOrderItem[];
  subtotalCents: number;
  taxesCents: number;
  grandTotalCents: number;
}

function resolveAllowedDecimalPlaces(unitPrecision: number): number {
  return Math.max(0, Math.min(unitPrecision, MAX_SUPPORTED_DECIMAL_PLACES));
}

function buildWorkOrderVariationSelections(
  variation: SelectedVariationLookup | null,
): WorkOrderVariationSelectionSnapshot[] {
  if (!variation) {
    return [];
  }

  return [...variation.selections]
    .sort((left, right) => {
      if (left.group.sortOrder !== right.group.sortOrder) {
        return left.group.sortOrder - right.group.sortOrder;
      }

      if (left.group.name !== right.group.name) {
        return left.group.name.localeCompare(right.group.name);
      }

      return left.option.name.localeCompare(right.option.name);
    })
    .map((selection) => ({
      groupId: selection.group.id,
      groupName: selection.group.name,
      groupCustomerLabel: selection.group.customerLabel,
      optionId: selection.option.id,
      optionName: selection.option.name,
    }));
}

export async function validateOrderOrganization(
  fastify: FastifyInstance,
  organizationId: string,
): Promise<void> {
  const organization = await fastify.db.query.organizationDB.findFirst({
    where(table, { and, eq, isNull }) {
      return and(eq(table.id, organizationId), isNull(table.deletedAt));
    },
    columns: {
      id: true,
    },
  });

  if (!organization) {
    throw notFound("organization.notFound", "The organization was not found");
  }
}

export async function validateOrderCustomer(
  fastify: FastifyInstance,
  customerId: string,
): Promise<void> {
  const customer = await fastify.db.query.customersDB.findFirst({
    where(table, { and, eq, isNull }) {
      return and(eq(table.id, customerId), isNull(table.deletedAt));
    },
    columns: {
      id: true,
    },
  });

  if (!customer) {
    throw notFound("customer.notFound", "The customer was not found");
  }
}

export async function buildOrderValidationContext(
  fastify: FastifyInstance,
  organizationId: string,
  items: NormalizedCreateOrderItemParams[],
): Promise<OrderValidationContext> {
  const uniqueProductIds = [...new Set(items.map((item) => item.productId))];
  const uniqueVariationIds = [
    ...new Set(
      items
        .map((item) => item.variationId)
        .filter((variationId): variationId is string => variationId !== null),
    ),
  ];

  const activeOrganizationProducts = await fastify.db.query.organizationProductDB.findMany({
    where(table, { and, eq, inArray }) {
      return and(
        eq(table.organizationId, organizationId),
        eq(table.isActive, true),
        inArray(table.productId, uniqueProductIds),
      );
    },
    columns: {
      productId: true,
    },
  });

  if (activeOrganizationProducts.length !== uniqueProductIds.length) {
    throw notFound(
      "product.notAvailableInOrganization",
      "One or more products are not available in this organization",
    );
  }

  const [products, variationsByProduct, selectedVariations, productModifierLinks] =
    await Promise.all([
      fastify.db.query.productsDB.findMany({
        where(table, { and, inArray, isNull }) {
          return and(inArray(table.id, uniqueProductIds), isNull(table.deletedAt));
        },
        columns: {
          id: true,
          name: true,
          kitchenName: true,
          priceCents: true,
          categoryId: true,
        },
        with: {
          category: {
            columns: {
              isFourPlusOneEligible: true,
            },
          },
          unit: {
            columns: {
              id: true,
              name: true,
              abbreviation: true,
              precision: true,
            },
          },
          taxes: {
            columns: {
              productId: false,
              taxId: false,
            },
            with: {
              tax: {
                columns: {
                  id: true,
                  name: true,
                  rate: true,
                },
              },
            },
          },
        },
      }),
      fastify.db
        .select({
          id: variationsDB.id,
          productId: variationsDB.productId,
        })
        .from(variationsDB)
        .where(
          and(inArray(variationsDB.productId, uniqueProductIds), isNull(variationsDB.deletedAt)),
        ),
      uniqueVariationIds.length > 0
        ? fastify.db.query.variationsDB.findMany({
            where(table, { and, inArray, isNull }) {
              return and(inArray(table.id, uniqueVariationIds), isNull(table.deletedAt));
            },
            columns: {
              id: true,
              productId: true,
              priceCents: true,
              kitchenName: true,
              customerDescription: true,
            },
            with: {
              selections: {
                columns: {
                  variationId: false,
                  variationGroupId: false,
                  variationOptionId: false,
                },
                with: {
                  group: {
                    columns: {
                      id: true,
                      name: true,
                      customerLabel: true,
                      sortOrder: true,
                    },
                  },
                  option: {
                    columns: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      fastify.db.query.productModifiersDB.findMany({
        where(table, { inArray }) {
          return inArray(table.productId, uniqueProductIds);
        },
        columns: {
          productId: true,
          sortOrder: true,
        },
        with: {
          modifier: {
            columns: {
              id: true,
              name: true,
              kitchenName: true,
              multiSelect: true,
              minSelect: true,
              maxSelect: true,
            },
            with: {
              options: {
                columns: {
                  id: true,
                  name: true,
                  kitchenName: true,
                  priceCents: true,
                },
              },
            },
          },
        },
      }),
    ]);

  if (products.length !== uniqueProductIds.length) {
    throw notFound("product.notFound", "One or more products were not found");
  }

  if (uniqueVariationIds.length > 0 && selectedVariations.length !== uniqueVariationIds.length) {
    throw notFound("variation.notFound", "One or more variations were not found");
  }

  const productsById = new Map<string, ProductLookup>(
    products.map((product) => [product.id, product]),
  );
  const selectedVariationsById = new Map<string, SelectedVariationLookup>(
    selectedVariations.map((variation) => [variation.id, variation]),
  );

  const variationIdsByProductId = new Map<string, Set<string>>();
  for (const variation of variationsByProduct) {
    const currentVariationIds = variationIdsByProductId.get(variation.productId) ?? new Set();
    currentVariationIds.add(variation.id);
    variationIdsByProductId.set(variation.productId, currentVariationIds);
  }

  const productModifierConfigsByProductId = new Map<string, ProductModifierConfig[]>();
  const modifierOptionLookupByProductId = new Map<string, Map<string, ModifierOptionLookupValue>>();

  for (const productModifier of productModifierLinks) {
    const productModifierConfigs =
      productModifierConfigsByProductId.get(productModifier.productId) ?? [];
    productModifierConfigs.push({
      id: productModifier.modifier.id,
      name: productModifier.modifier.name,
      kitchenName: productModifier.modifier.kitchenName,
      minSelect: productModifier.modifier.minSelect,
      maxSelect: productModifier.modifier.maxSelect,
      multiSelect: productModifier.modifier.multiSelect,
      sortOrder: productModifier.sortOrder,
    });
    productModifierConfigsByProductId.set(productModifier.productId, productModifierConfigs);

    const modifierOptionLookup =
      modifierOptionLookupByProductId.get(productModifier.productId) ?? new Map();

    for (const modifierOption of productModifier.modifier.options) {
      modifierOptionLookup.set(modifierOption.id, {
        modifierId: productModifier.modifier.id,
        modifierName: productModifier.modifier.name,
        modifierKitchenName: productModifier.modifier.kitchenName,
        optionId: modifierOption.id,
        optionName: modifierOption.name,
        optionKitchenName: modifierOption.kitchenName,
        optionPriceCents: modifierOption.priceCents,
      });
    }

    modifierOptionLookupByProductId.set(productModifier.productId, modifierOptionLookup);
  }

  for (const productModifierConfig of productModifierConfigsByProductId.values()) {
    productModifierConfig.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      if (left.name !== right.name) {
        return left.name.localeCompare(right.name);
      }

      return left.id.localeCompare(right.id);
    });
  }

  return {
    productsById,
    selectedVariationsById,
    variationIdsByProductId,
    productModifierConfigsByProductId,
    modifierOptionLookupByProductId,
  };
}

export function validateAndPrepareOrderPayload(
  items: NormalizedCreateOrderItemParams[],
  context: OrderValidationContext,
  options?: {
    enforceModifierMinSelect?: boolean;
  },
): PreparedOrderPayload {
  const enforceModifierMinSelect = options?.enforceModifierMinSelect ?? false;
  const preparedOrderItems: PreparedOrderItem[] = [];
  const hasManualPromotionMode = items.some((item) => item.clientItemId !== null);

  if (hasManualPromotionMode) {
    assertUniqueValues(
      items.map((item) => item.clientItemId),
      "order.manualPromotion.duplicateClientItemId",
      "Manual promotion mode requires unique clientItemId values per item",
    );
  }

  for (const [itemIndex, itemInput] of items.entries()) {
    const itemPosition = itemIndex + 1;
    const product = context.productsById.get(itemInput.productId);

    if (!product) {
      throw notFound("product.notFound", `Product for item #${itemPosition} was not found`);
    }

    const allowedDecimalPlaces = resolveAllowedDecimalPlaces(product.unit.precision);
    if (!hasAtMostDecimalPlaces(itemInput.quantity, allowedDecimalPlaces)) {
      throw validation(
        "orderItem.invalidQuantityPrecision",
        `Item #${itemPosition} quantity must have at most ${allowedDecimalPlaces} decimal places`,
      );
    }

    const productVariationIds =
      context.variationIdsByProductId.get(product.id) ?? new Set<string>();
    const hasVariations = productVariationIds.size > 0;

    if (hasVariations && !itemInput.variationId) {
      throw validation(
        "orderItem.variationRequired",
        `Item #${itemPosition} requires a variation for product "${product.name}"`,
      );
    }

    if (!hasVariations && itemInput.variationId) {
      throw validation(
        "orderItem.variationNotAllowed",
        `Item #${itemPosition} cannot include variation for product "${product.name}"`,
      );
    }

    const selectedVariation = itemInput.variationId
      ? context.selectedVariationsById.get(itemInput.variationId)
      : null;

    if (itemInput.variationId && !selectedVariation) {
      throw notFound("variation.notFound", `Variation for item #${itemPosition} was not found`);
    }

    if (selectedVariation && selectedVariation.productId !== product.id) {
      throw validation(
        "orderItem.invalidVariation",
        `Item #${itemPosition} includes a variation that does not belong to product "${product.name}"`,
      );
    }

    const unitPriceCents = selectedVariation?.priceCents ?? product.priceCents;

    if (unitPriceCents === null) {
      throw validation(
        "orderItem.priceUnavailable",
        `Item #${itemPosition} has no available price for product "${product.name}"`,
      );
    }

    if (itemInput.redeemFreeUnits > 0) {
      if (!Number.isInteger(itemInput.quantity)) {
        throw validation(
          "order.manualPromotion.invalidQuantity",
          `Item #${itemPosition} must have integer quantity when redeemFreeUnits is provided`,
        );
      }

      if (itemInput.redeemFreeUnits > itemInput.quantity) {
        throw validation(
          "order.manualPromotion.invalidRedeemFreeUnits",
          `Item #${itemPosition} redeemFreeUnits cannot exceed quantity`,
        );
      }
    }

    assertUniqueValues(
      itemInput.modifiers.map((modifier) => modifier.modifierOptionId),
      "orderItem.duplicateModifierOption",
      `Item #${itemPosition} contains duplicated modifier options`,
    );

    const modifierOptionLookup =
      context.modifierOptionLookupByProductId.get(product.id) ?? new Map();
    const selectedModifierOptionsByModifierId = new Map<string, ModifierOptionLookupValue[]>();
    const orderItemId = generateNanoId();
    const modifierRows: OrderItemModifierInsert[] = [];
    const workOrderModifierSnapshots: WorkOrderModifierSnapshot[] = [];
    let modifiersSubtotalCents = 0;

    for (const [modifierIndex, selectedModifier] of itemInput.modifiers.entries()) {
      const modifierOption = modifierOptionLookup.get(selectedModifier.modifierOptionId);

      if (!modifierOption) {
        throw validation(
          "orderItem.invalidModifierOption",
          `Item #${itemPosition} contains a modifier option that does not belong to product "${product.name}"`,
        );
      }

      const totalPriceCents = calculateExtendedPriceCents(
        modifierOption.optionPriceCents,
        selectedModifier.quantity,
      );
      modifiersSubtotalCents += totalPriceCents;

      const currentSelectedModifiers =
        selectedModifierOptionsByModifierId.get(modifierOption.modifierId) ?? [];
      currentSelectedModifiers.push(modifierOption);
      selectedModifierOptionsByModifierId.set(modifierOption.modifierId, currentSelectedModifiers);

      modifierRows.push({
        id: generateNanoId(),
        orderItemId,
        modifierId: modifierOption.modifierId,
        modifierOptionId: modifierOption.optionId,
        modifierName: modifierOption.modifierName,
        modifierOptionName: modifierOption.optionName,
        quantity: selectedModifier.quantity,
        unitPriceCents: modifierOption.optionPriceCents,
        totalPriceCents,
        sortOrder: modifierIndex,
      });
      workOrderModifierSnapshots.push({
        modifierId: modifierOption.modifierId,
        modifierName: modifierOption.modifierName,
        modifierKitchenName: modifierOption.modifierKitchenName,
        modifierOptionId: modifierOption.optionId,
        modifierOptionName: modifierOption.optionName,
        modifierOptionKitchenName: modifierOption.optionKitchenName,
        quantity: selectedModifier.quantity,
      });
    }

    const productModifiers = context.productModifierConfigsByProductId.get(product.id) ?? [];
    for (const productModifier of productModifiers) {
      const selectedModifierCount =
        selectedModifierOptionsByModifierId.get(productModifier.id)?.length ?? 0;

      if (enforceModifierMinSelect && selectedModifierCount < productModifier.minSelect) {
        throw validation(
          "orderItem.missingRequiredModifier",
          `Item #${itemPosition} requires at least ${productModifier.minSelect} selection(s) for modifier "${productModifier.name}"`,
        );
      }

      if (productModifier.maxSelect !== null && selectedModifierCount > productModifier.maxSelect) {
        throw validation(
          "orderItem.maxModifierSelectionsExceeded",
          `Item #${itemPosition} allows at most ${productModifier.maxSelect} selection(s) for modifier "${productModifier.name}"`,
        );
      }

      if (!productModifier.multiSelect && selectedModifierCount > 1) {
        throw validation(
          "orderItem.singleSelectModifierExceeded",
          `Item #${itemPosition} allows only one selection for modifier "${productModifier.name}"`,
        );
      }
    }

    const productGrossTotalCents = calculateExtendedPriceCents(unitPriceCents, itemInput.quantity);
    const grossTotalCents = productGrossTotalCents + modifiersSubtotalCents;
    const displayUnitPriceCents =
      unitPriceCents +
      (itemInput.quantity > 0 ? Math.round(modifiersSubtotalCents / itemInput.quantity) : 0);
    const includedTaxBreakdown = calculateIncludedTaxBreakdown(
      grossTotalCents,
      product.taxes.map(({ tax }) => tax.rate),
    );
    const taxRows: OrderItemTaxInsert[] = product.taxes.map(({ tax }, taxIndex) => ({
      orderItemId,
      taxId: tax.id,
      taxName: tax.name,
      taxRate: tax.rate,
      taxAmountCents: includedTaxBreakdown.taxAmountsCents[taxIndex] ?? 0,
    }));
    const taxesCents = taxRows.reduce(
      (accumulator, taxRow) => accumulator + taxRow.taxAmountCents,
      0,
    );
    const subtotalCents = grossTotalCents - taxesCents;

    preparedOrderItems.push({
      item: {
        id: orderItemId,
        productId: product.id,
        variationId: selectedVariation?.id ?? null,
        unitId: product.unit.id,
        productName: product.name,
        variationName: selectedVariation ? resolveVariationName(selectedVariation) : null,
        unitName: product.unit.name,
        unitAbbreviation: product.unit.abbreviation,
        unitPrecision: product.unit.precision,
        quantity: itemInput.quantity,
        comment: itemInput.comment,
        unitPriceCents,
        modifiersSubtotalCents,
        freeUnits: 0,
        promotionCode: null,
        promotionDiscountCents: 0,
        couponDiscountCents: 0,
        subtotalCents,
        taxesCents,
        grandTotalCents: grossTotalCents,
        sortOrder: itemIndex,
      },
      modifiers: modifierRows,
      taxes: taxRows,
      workOrderSnapshot: {
        productKitchenName: product.kitchenName,
        variationSelections: buildWorkOrderVariationSelections(selectedVariation ?? null),
        modifiers: workOrderModifierSnapshots,
      },
      isPromotionEligible: product.category?.isFourPlusOneEligible ?? false,
      productCategoryId: product.categoryId,
      sourceClientItemId: hasManualPromotionMode ? itemInput.clientItemId : null,
      requestedRedeemFreeUnits: hasManualPromotionMode ? itemInput.redeemFreeUnits : 0,
      lineType: "paid",
      displayUnitPriceCents,
    });
  }

  const subtotalCents = preparedOrderItems.reduce(
    (accumulator, preparedOrderItem) => accumulator + preparedOrderItem.item.subtotalCents,
    0,
  );
  const taxesCents = preparedOrderItems.reduce(
    (accumulator, preparedOrderItem) => accumulator + preparedOrderItem.item.taxesCents,
    0,
  );

  return {
    items: preparedOrderItems,
    subtotalCents,
    taxesCents,
    grandTotalCents: subtotalCents + taxesCents,
  };
}
