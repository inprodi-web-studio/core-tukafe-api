import { variationsDB } from "@core/db/schemas";
import type { orderItemModifiersDB, orderItemsDB, orderItemTaxesDB } from "@core/db/schemas";
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
  calculateExtendedPriceCents,
  calculateTaxAmountCents,
  resolveVariationName,
} from "./orders.helpers";
import type { NormalizedCreateOrderItemParams } from "./orders.types";

type OrderItemInsert = typeof orderItemsDB.$inferInsert;
type OrderItemModifierInsert = typeof orderItemModifiersDB.$inferInsert;
type OrderItemTaxInsert = typeof orderItemTaxesDB.$inferInsert;

interface ProductModifierConfig {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  multiSelect: boolean;
  sortOrder: number;
}

interface ModifierOptionLookupValue {
  modifierId: string;
  modifierName: string;
  optionId: string;
  optionName: string;
  optionPriceCents: number;
}

interface ProductLookup {
  id: string;
  name: string;
  priceCents: number | null;
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
      name: string;
      sortOrder: number;
    };
    option: {
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
          priceCents: true,
        },
        with: {
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
        .where(and(inArray(variationsDB.productId, uniqueProductIds), isNull(variationsDB.deletedAt))),
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
                      name: true,
                      sortOrder: true,
                    },
                  },
                  option: {
                    columns: {
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
              multiSelect: true,
              minSelect: true,
              maxSelect: true,
            },
            with: {
              options: {
                columns: {
                  id: true,
                  name: true,
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
        optionId: modifierOption.id,
        optionName: modifierOption.name,
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
): PreparedOrderPayload {
  const preparedOrderItems: PreparedOrderItem[] = [];

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

    const productVariationIds = context.variationIdsByProductId.get(product.id) ?? new Set<string>();
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

    assertUniqueValues(
      itemInput.modifiers.map((modifier) => modifier.modifierOptionId),
      "orderItem.duplicateModifierOption",
      `Item #${itemPosition} contains duplicated modifier options`,
    );

    const modifierOptionLookup = context.modifierOptionLookupByProductId.get(product.id) ?? new Map();
    const selectedModifierOptionsByModifierId = new Map<string, ModifierOptionLookupValue[]>();
    const orderItemId = generateNanoId();
    const modifierRows: OrderItemModifierInsert[] = [];
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
    }

    const productModifiers = context.productModifierConfigsByProductId.get(product.id) ?? [];
    for (const productModifier of productModifiers) {
      const selectedModifierCount =
        selectedModifierOptionsByModifierId.get(productModifier.id)?.length ?? 0;

      if (selectedModifierCount < productModifier.minSelect) {
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

    const productSubtotalCents = calculateExtendedPriceCents(unitPriceCents, itemInput.quantity);
    const subtotalCents = productSubtotalCents + modifiersSubtotalCents;
    const taxRows: OrderItemTaxInsert[] = product.taxes.map(({ tax }) => ({
      orderItemId,
      taxId: tax.id,
      taxName: tax.name,
      taxRate: tax.rate,
      taxAmountCents: calculateTaxAmountCents(subtotalCents, tax.rate),
    }));
    const taxesCents = taxRows.reduce(
      (accumulator, taxRow) => accumulator + taxRow.taxAmountCents,
      0,
    );

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
        subtotalCents,
        taxesCents,
        grandTotalCents: subtotalCents + taxesCents,
        sortOrder: itemIndex,
      },
      modifiers: modifierRows,
      taxes: taxRows,
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
