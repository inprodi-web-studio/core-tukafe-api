import {
  productCompoundComponentsDB,
  productCompoundSlotOptionsDB,
  productCompoundSlotsDB,
  variationsDB,
} from "@core/db/schemas";
import type {
  orderItemCompoundComponentsDB,
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
import { and, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  calculateIncludedTaxBreakdown,
  calculateExtendedPriceCents,
  resolveVariationName,
} from "./orders.helpers";
import type { NormalizedCreateOrderItemParams } from "./orders.types";

type OrderItemInsert = typeof orderItemsDB.$inferInsert;
type OrderItemCompoundComponentInsert = typeof orderItemCompoundComponentsDB.$inferInsert;
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
  visibleWhen: ProductModifierVisibilityCondition[];
}

interface ProductModifierVisibilityCondition {
  variationGroupId: string;
  variationOptionId: string;
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
  productType: "simple" | "assembled" | "compound";
  priceCents: number | null;
  categoryId: string | null;
  category: {
    isFourPlusOneEligible: boolean;
    isCashbackEligible: boolean;
  } | null;
  categories: Array<{
    categoryId: string;
    category: {
      isFourPlusOneEligible: boolean;
      isCashbackEligible: boolean;
    };
  }>;
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

interface ProductCompoundComponentLookup {
  componentId: string;
  compoundProductId: string;
  componentProductId: string;
  quantity: number;
  sortOrder: number;
  label: string | null;
}

interface ProductCompoundSlotLookup {
  slotId: string;
  compoundProductId: string;
  label: string;
  quantity: number;
  sortOrder: number;
  options: ProductCompoundSlotOptionLookup[];
}

interface ProductCompoundSlotOptionLookup {
  optionId: string;
  slotId: string;
  componentProductId: string;
  label: string | null;
  sortOrder: number;
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
      kitchenName: string | null;
    };
  }>;
}

interface OrderValidationContext {
  productsById: Map<string, ProductLookup>;
  compoundComponentsByProductId: Map<string, ProductCompoundComponentLookup[]>;
  compoundSlotsByProductId: Map<string, ProductCompoundSlotLookup[]>;
  selectedVariationsById: Map<string, SelectedVariationLookup>;
  variationIdsByProductId: Map<string, Set<string>>;
  productModifierConfigsByProductId: Map<string, ProductModifierConfig[]>;
  modifierOptionLookupByProductId: Map<string, Map<string, ModifierOptionLookupValue>>;
}

export interface PreparedOrderItem {
  item: Omit<OrderItemInsert, "orderId">;
  compoundComponents: OrderItemCompoundComponentInsert[];
  modifiers: OrderItemModifierInsert[];
  taxes: OrderItemTaxInsert[];
  workOrderSnapshot: {
    productKitchenName: string | null;
    variationSelections: WorkOrderVariationSelectionSnapshot[];
    modifiers: WorkOrderModifierSnapshot[];
  };
  isPromotionEligible: boolean;
  isCashbackEligible: boolean;
  productCategoryId: string | null;
  productCategoryIds: string[];
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

async function productModifierOptionsTableExists(fastify: FastifyInstance): Promise<boolean> {
  const result = await fastify.db.execute<{ exists: boolean }>(sql`
    select to_regclass('public.product_modifier_option') is not null as "exists"
  `);

  return result.rows[0]?.exists ?? false;
}

async function productModifierVisibilityRulesTableExists(
  fastify: FastifyInstance,
): Promise<boolean> {
  const result = await fastify.db.execute<{ exists: boolean }>(sql`
    select to_regclass('public.product_modifier_visibility_rule') is not null as "exists"
  `);

  return result.rows[0]?.exists ?? false;
}

function isProductModifierVisibleForVariation(
  productModifier: ProductModifierConfig,
  variation: SelectedVariationLookup | null,
) {
  if (productModifier.visibleWhen.length === 0) {
    return true;
  }

  if (!variation) {
    return false;
  }

  return productModifier.visibleWhen.some((condition) =>
    variation.selections.some(
      (selection) =>
        selection.group.id === condition.variationGroupId &&
        selection.option.id === condition.variationOptionId,
    ),
  );
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
      optionKitchenName: selection.option.kitchenName,
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
  const uniqueTopLevelProductIds = [...new Set(items.map((item) => item.productId))];
  const explicitComponentProductIds = items.flatMap((item) =>
    item.components.map((component) => component.productId),
  );
  const uniqueProductIds = [
    ...new Set([...uniqueTopLevelProductIds, ...explicitComponentProductIds]),
  ];
  const uniqueVariationIds = [
    ...new Set(
      items
        .flatMap((item) => [
          item.variationId,
          ...item.components.map((component) => component.variationId),
        ])
        .filter((variationId): variationId is string => variationId !== null),
    ),
  ];
  const [includeAllowedModifierOptions, includeModifierVisibilityRules] = await Promise.all([
    productModifierOptionsTableExists(fastify),
    productModifierVisibilityRulesTableExists(fastify),
  ]);

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

  const [
    products,
    variationsByProduct,
    selectedVariations,
    productModifierLinks,
    allowedModifierOptions,
    modifierVisibilityRules,
    compoundComponents,
    compoundSlots,
  ] = await Promise.all([
    fastify.db.query.productsDB.findMany({
      where(table, { and, inArray, isNull }) {
        return and(inArray(table.id, uniqueProductIds), isNull(table.deletedAt));
      },
      columns: {
        id: true,
        name: true,
        kitchenName: true,
        productType: true,
        priceCents: true,
        categoryId: true,
      },
      with: {
        category: {
          columns: {
            isFourPlusOneEligible: true,
            isCashbackEligible: true,
          },
        },
        categories: {
          columns: {
            productId: false,
            createdAt: false,
            updatedAt: false,
          },
          with: {
            category: {
              columns: {
                isFourPlusOneEligible: true,
                isCashbackEligible: true,
              },
            },
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
    includeAllowedModifierOptions
      ? fastify.db.query.productModifierOptionsDB.findMany({
          where(table, { inArray }) {
            return inArray(table.productId, uniqueProductIds);
          },
          columns: {
            productId: true,
            modifierId: true,
            modifierOptionId: true,
            createdAt: false,
            updatedAt: false,
          },
        })
      : Promise.resolve([]),
    includeModifierVisibilityRules
      ? fastify.db.query.productModifierVisibilityRulesDB.findMany({
          where(table, { inArray }) {
            return inArray(table.productId, uniqueProductIds);
          },
          columns: {
            productId: true,
            modifierId: true,
            variationGroupId: true,
            variationOptionId: true,
            createdAt: false,
            updatedAt: false,
          },
        })
      : Promise.resolve([]),
    uniqueTopLevelProductIds.length > 0
      ? fastify.db
          .select({
            compoundProductId: productCompoundComponentsDB.compoundProductId,
            componentProductId: productCompoundComponentsDB.componentProductId,
            quantity: productCompoundComponentsDB.quantity,
            sortOrder: productCompoundComponentsDB.sortOrder,
            label: productCompoundComponentsDB.label,
          })
          .from(productCompoundComponentsDB)
          .where(inArray(productCompoundComponentsDB.compoundProductId, uniqueTopLevelProductIds))
      : Promise.resolve([]),
    uniqueTopLevelProductIds.length > 0
      ? fastify.db
          .select({
            slotId: productCompoundSlotsDB.id,
            compoundProductId: productCompoundSlotsDB.compoundProductId,
            slotLabel: productCompoundSlotsDB.label,
            quantity: productCompoundSlotsDB.quantity,
            slotSortOrder: productCompoundSlotsDB.sortOrder,
            optionId: productCompoundSlotOptionsDB.id,
            componentProductId: productCompoundSlotOptionsDB.componentProductId,
            optionLabel: productCompoundSlotOptionsDB.label,
            optionSortOrder: productCompoundSlotOptionsDB.sortOrder,
          })
          .from(productCompoundSlotsDB)
          .innerJoin(
            productCompoundSlotOptionsDB,
            sql`${productCompoundSlotOptionsDB.slotId} = ${productCompoundSlotsDB.id}`,
          )
          .where(inArray(productCompoundSlotsDB.compoundProductId, uniqueTopLevelProductIds))
      : Promise.resolve([]),
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
    selectedVariations.map((variation) => [
      variation.id,
      {
        ...variation,
        selections: variation.selections.map((selection) => ({
          ...selection,
          option: {
            ...selection.option,
            kitchenName: null,
          },
        })),
      },
    ]),
  );

  const variationIdsByProductId = new Map<string, Set<string>>();
  for (const variation of variationsByProduct) {
    const currentVariationIds = variationIdsByProductId.get(variation.productId) ?? new Set();
    currentVariationIds.add(variation.id);
    variationIdsByProductId.set(variation.productId, currentVariationIds);
  }

  const compoundComponentsByProductId = new Map<string, ProductCompoundComponentLookup[]>();
  for (const component of compoundComponents) {
    const componentId = `${component.compoundProductId}:${component.sortOrder}`;
    const currentComponents = compoundComponentsByProductId.get(component.compoundProductId) ?? [];

    currentComponents.push({
      componentId,
      compoundProductId: component.compoundProductId,
      componentProductId: component.componentProductId,
      quantity: component.quantity,
      sortOrder: component.sortOrder,
      label: component.label,
    });
    compoundComponentsByProductId.set(component.compoundProductId, currentComponents);
  }

  for (const components of compoundComponentsByProductId.values()) {
    components.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.componentProductId.localeCompare(right.componentProductId);
    });
  }

  const compoundSlotsByProductId = new Map<string, ProductCompoundSlotLookup[]>();
  const compoundSlotsById = new Map<string, ProductCompoundSlotLookup>();
  for (const row of compoundSlots) {
    let slot = compoundSlotsById.get(row.slotId);
    if (!slot) {
      slot = {
        slotId: row.slotId,
        compoundProductId: row.compoundProductId,
        label: row.slotLabel,
        quantity: row.quantity,
        sortOrder: row.slotSortOrder,
        options: [],
      };
      compoundSlotsById.set(row.slotId, slot);
      const currentSlots = compoundSlotsByProductId.get(row.compoundProductId) ?? [];
      currentSlots.push(slot);
      compoundSlotsByProductId.set(row.compoundProductId, currentSlots);
    }

    slot.options.push({
      optionId: row.optionId,
      slotId: row.slotId,
      componentProductId: row.componentProductId,
      label: row.optionLabel,
      sortOrder: row.optionSortOrder,
    });
  }

  for (const slots of compoundSlotsByProductId.values()) {
    slots.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.slotId.localeCompare(right.slotId);
    });

    for (const slot of slots) {
      slot.options.sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.componentProductId.localeCompare(right.componentProductId);
      });
    }
  }

  const productModifierConfigsByProductId = new Map<string, ProductModifierConfig[]>();
  const modifierOptionLookupByProductId = new Map<string, Map<string, ModifierOptionLookupValue>>();
  const allowedOptionIdsByProductModifier = new Map<string, Set<string>>();
  const visibilityRulesByProductModifier = new Map<string, ProductModifierVisibilityCondition[]>();

  for (const allowedOption of allowedModifierOptions) {
    const key = `${allowedOption.productId}:${allowedOption.modifierId}`;
    const current = allowedOptionIdsByProductModifier.get(key) ?? new Set<string>();
    current.add(allowedOption.modifierOptionId);
    allowedOptionIdsByProductModifier.set(key, current);
  }

  for (const rule of modifierVisibilityRules) {
    const key = `${rule.productId}:${rule.modifierId}`;
    const currentRules = visibilityRulesByProductModifier.get(key) ?? [];
    currentRules.push({
      variationGroupId: rule.variationGroupId,
      variationOptionId: rule.variationOptionId,
    });
    visibilityRulesByProductModifier.set(key, currentRules);
  }

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
      visibleWhen:
        visibilityRulesByProductModifier.get(
          `${productModifier.productId}:${productModifier.modifier.id}`,
        ) ?? [],
    });
    productModifierConfigsByProductId.set(productModifier.productId, productModifierConfigs);

    const modifierOptionLookup =
      modifierOptionLookupByProductId.get(productModifier.productId) ?? new Map();

    const allowedOptionIds =
      allowedOptionIdsByProductModifier.get(
        `${productModifier.productId}:${productModifier.modifier.id}`,
      ) ?? new Set<string>();
    const modifierOptions =
      allowedOptionIds.size > 0
        ? productModifier.modifier.options.filter((option) => allowedOptionIds.has(option.id))
        : productModifier.modifier.options;

    for (const modifierOption of modifierOptions) {
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
    compoundComponentsByProductId,
    compoundSlotsByProductId,
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

    if (product.productType === "compound") {
      if (itemInput.variationId) {
        throw validation(
          "orderItem.compoundVariationNotAllowed",
          `Item #${itemPosition} cannot include variation on combo "${product.name}"`,
        );
      }

      if (itemInput.modifiers.length > 0) {
        throw validation(
          "orderItem.compoundModifiersNotAllowed",
          `Item #${itemPosition} cannot include modifiers directly on combo "${product.name}"`,
        );
      }

      const unitPriceCents = product.priceCents;
      if (unitPriceCents === null) {
        throw validation(
          "orderItem.priceUnavailable",
          `Item #${itemPosition} has no available price for combo "${product.name}"`,
        );
      }

      const legacyCatalogComponents = context.compoundComponentsByProductId.get(product.id) ?? [];
      const configuredSlots = context.compoundSlotsByProductId.get(product.id) ?? [];
      const catalogSlots =
        configuredSlots.length > 0
          ? configuredSlots
          : legacyCatalogComponents.map((component) => ({
              slotId: component.componentId,
              compoundProductId: component.compoundProductId,
              label: component.label ?? `Componente ${component.sortOrder + 1}`,
              quantity: component.quantity,
              sortOrder: component.sortOrder,
              options: [
                {
                  optionId: component.componentId,
                  slotId: component.componentId,
                  componentProductId: component.componentProductId,
                  label: component.label,
                  sortOrder: 0,
                },
              ],
            }));

      if (catalogSlots.length < 2) {
        throw validation(
          "orderItem.compoundComponentsUnavailable",
          `Item #${itemPosition} combo "${product.name}" does not have enough configured components`,
        );
      }

      if (itemInput.components.length !== catalogSlots.length) {
        throw validation(
          "orderItem.compoundComponentsRequired",
          `Item #${itemPosition} combo "${product.name}" requires all configured components`,
        );
      }

      assertUniqueValues(
        itemInput.components.map((component) => component.slotId ?? component.componentId),
        "orderItem.compoundDuplicateComponent",
        `Item #${itemPosition} contains duplicated combo components`,
      );

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

      const orderItemId = generateNanoId();
      const componentsById = new Map(
        itemInput.components.map((component) => [
          component.slotId ?? component.componentId ?? "",
          component,
        ]),
      );
      const componentRows: OrderItemCompoundComponentInsert[] = [];
      let modifiersSubtotalCents = 0;

      for (const catalogSlot of catalogSlots) {
        const componentInput = componentsById.get(catalogSlot.slotId);
        if (!componentInput) {
          throw validation(
            "orderItem.compoundComponentMissing",
            `Item #${itemPosition} combo "${product.name}" is missing a configured component`,
          );
        }

        const selectedOption =
          componentInput.slotOptionId && componentInput.slotOptionId.trim().length > 0
            ? (catalogSlot.options.find(
                (option) => option.optionId === componentInput.slotOptionId,
              ) ?? null)
            : catalogSlot.options.length === 1
              ? catalogSlot.options[0]
              : (catalogSlot.options.find(
                  (option) => option.componentProductId === componentInput.productId,
                ) ?? null);

        if (!selectedOption) {
          throw validation(
            "orderItem.compoundInvalidSlotOption",
            `Item #${itemPosition} includes an invalid option for combo section "${catalogSlot.label}"`,
          );
        }

        if (componentInput.productId !== selectedOption.componentProductId) {
          throw validation(
            "orderItem.compoundInvalidComponentProduct",
            `Item #${itemPosition} includes a component product that does not belong to combo "${product.name}"`,
          );
        }

        const componentProduct = context.productsById.get(selectedOption.componentProductId);
        if (!componentProduct) {
          throw notFound(
            "product.notFound",
            `Component product for item #${itemPosition} was not found`,
          );
        }

        if (componentProduct.productType === "compound") {
          throw validation(
            "orderItem.nestedCompoundNotSupported",
            `Item #${itemPosition} cannot include a combo inside combo "${product.name}"`,
          );
        }

        const componentVariationIds =
          context.variationIdsByProductId.get(componentProduct.id) ?? new Set<string>();
        const componentHasVariations = componentVariationIds.size > 0;

        if (componentHasVariations && !componentInput.variationId) {
          throw validation(
            "orderItem.variationRequired",
            `Component "${componentProduct.name}" in item #${itemPosition} requires a variation`,
          );
        }

        if (!componentHasVariations && componentInput.variationId) {
          throw validation(
            "orderItem.variationNotAllowed",
            `Component "${componentProduct.name}" in item #${itemPosition} cannot include variation`,
          );
        }

        const selectedVariation = componentInput.variationId
          ? (context.selectedVariationsById.get(componentInput.variationId) ?? null)
          : null;

        if (componentInput.variationId && !selectedVariation) {
          throw notFound(
            "variation.notFound",
            `Variation for component "${componentProduct.name}" in item #${itemPosition} was not found`,
          );
        }

        if (selectedVariation && selectedVariation.productId !== componentProduct.id) {
          throw validation(
            "orderItem.invalidVariation",
            `Component "${componentProduct.name}" in item #${itemPosition} includes a variation that does not belong to it`,
          );
        }

        const productModifiers =
          context.productModifierConfigsByProductId.get(componentProduct.id) ?? [];
        const visibleProductModifiers = productModifiers.filter((productModifier) =>
          isProductModifierVisibleForVariation(productModifier, selectedVariation),
        );
        const visibleProductModifierIds = new Set(
          visibleProductModifiers.map((productModifier) => productModifier.id),
        );

        assertUniqueValues(
          componentInput.modifiers.map((modifier) => modifier.modifierOptionId),
          "orderItem.duplicateModifierOption",
          `Component "${componentProduct.name}" in item #${itemPosition} contains duplicated modifier options`,
        );

        const modifierOptionLookup =
          context.modifierOptionLookupByProductId.get(componentProduct.id) ?? new Map();
        const selectedModifierOptionsByModifierId = new Map<string, ModifierOptionLookupValue[]>();
        const componentModifierSnapshots: OrderItemCompoundComponentInsert["modifiersSnapshot"] =
          [];
        let componentModifiersSubtotalCents = 0;

        for (const selectedModifier of componentInput.modifiers) {
          const modifierOption = modifierOptionLookup.get(selectedModifier.modifierOptionId);

          if (!modifierOption) {
            throw validation(
              "orderItem.invalidModifierOption",
              `Component "${componentProduct.name}" in item #${itemPosition} contains an invalid modifier option`,
            );
          }

          if (!visibleProductModifierIds.has(modifierOption.modifierId)) {
            throw validation(
              "orderItem.hiddenModifier",
              `Component "${componentProduct.name}" in item #${itemPosition} contains a hidden modifier for the selected variation`,
            );
          }

          const totalPriceCents = calculateExtendedPriceCents(
            modifierOption.optionPriceCents,
            selectedModifier.quantity * itemInput.quantity * catalogSlot.quantity,
          );
          componentModifiersSubtotalCents += totalPriceCents;

          const currentSelectedModifiers =
            selectedModifierOptionsByModifierId.get(modifierOption.modifierId) ?? [];
          currentSelectedModifiers.push(modifierOption);
          selectedModifierOptionsByModifierId.set(
            modifierOption.modifierId,
            currentSelectedModifiers,
          );

          componentModifierSnapshots.push({
            modifierId: modifierOption.modifierId,
            modifierName: modifierOption.modifierName,
            modifierKitchenName: modifierOption.modifierKitchenName,
            modifierOptionId: modifierOption.optionId,
            modifierOptionName: modifierOption.optionName,
            modifierOptionKitchenName: modifierOption.optionKitchenName,
            quantity: selectedModifier.quantity,
            unitPriceCents: modifierOption.optionPriceCents,
            totalPriceCents,
          });
        }

        for (const productModifier of visibleProductModifiers) {
          const selectedModifierCount =
            selectedModifierOptionsByModifierId.get(productModifier.id)?.length ?? 0;

          if (enforceModifierMinSelect && selectedModifierCount < productModifier.minSelect) {
            throw validation(
              "orderItem.missingRequiredModifier",
              `Component "${componentProduct.name}" in item #${itemPosition} requires at least ${productModifier.minSelect} selection(s) for modifier "${productModifier.name}"`,
            );
          }

          if (
            productModifier.maxSelect !== null &&
            selectedModifierCount > productModifier.maxSelect
          ) {
            throw validation(
              "orderItem.maxModifierSelectionsExceeded",
              `Component "${componentProduct.name}" in item #${itemPosition} allows at most ${productModifier.maxSelect} selection(s) for modifier "${productModifier.name}"`,
            );
          }

          if (!productModifier.multiSelect && selectedModifierCount > 1) {
            throw validation(
              "orderItem.singleSelectModifierExceeded",
              `Component "${componentProduct.name}" in item #${itemPosition} allows only one selection for modifier "${productModifier.name}"`,
            );
          }
        }

        modifiersSubtotalCents += componentModifiersSubtotalCents;
        componentRows.push({
          id: generateNanoId(),
          orderItemId,
          compoundProductId: product.id,
          slotId: catalogSlot.slotId,
          slotOptionId: selectedOption.optionId,
          slotLabel: catalogSlot.label,
          componentProductId: componentProduct.id,
          variationId: selectedVariation?.id ?? null,
          componentLabel: selectedOption.label ?? catalogSlot.label,
          productName: componentProduct.name,
          productKitchenName: componentProduct.kitchenName,
          variationName: selectedVariation ? resolveVariationName(selectedVariation) : null,
          variationSelectionsSnapshot: buildWorkOrderVariationSelections(selectedVariation ?? null),
          modifiersSnapshot: componentModifierSnapshots,
          quantity: catalogSlot.quantity,
          modifiersSubtotalCents: componentModifiersSubtotalCents,
          sortOrder: catalogSlot.sortOrder,
        });
      }

      const productGrossTotalCents = calculateExtendedPriceCents(
        unitPriceCents,
        itemInput.quantity,
      );
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
      const productCategoryIds = [
        ...new Set([
          ...(product.categoryId ? [product.categoryId] : []),
          ...product.categories.map((categoryLink) => categoryLink.categoryId),
        ]),
      ];
      const allProductCategories = [
        ...(product.category ? [product.category] : []),
        ...product.categories.map((categoryLink) => categoryLink.category),
      ];

      preparedOrderItems.push({
        item: {
          id: orderItemId,
          productId: product.id,
          variationId: null,
          unitId: product.unit.id,
          productName: product.name,
          variationName: null,
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
        compoundComponents: componentRows,
        modifiers: [],
        taxes: taxRows,
        workOrderSnapshot: {
          productKitchenName: product.kitchenName,
          variationSelections: [],
          modifiers: [],
        },
        isPromotionEligible: allProductCategories.some(
          (category) => category.isFourPlusOneEligible,
        ),
        isCashbackEligible: allProductCategories.some((category) => category.isCashbackEligible),
        productCategoryId: product.categoryId,
        productCategoryIds,
        sourceClientItemId: hasManualPromotionMode ? itemInput.clientItemId : null,
        requestedRedeemFreeUnits: hasManualPromotionMode ? itemInput.redeemFreeUnits : 0,
        lineType: "paid",
        displayUnitPriceCents,
      });

      continue;
    }

    if (itemInput.components.length > 0) {
      throw validation(
        "orderItem.componentsNotAllowed",
        `Item #${itemPosition} cannot include combo components for product "${product.name}"`,
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
      ? (context.selectedVariationsById.get(itemInput.variationId) ?? null)
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

    const productModifiers = context.productModifierConfigsByProductId.get(product.id) ?? [];
    const visibleProductModifiers = productModifiers.filter((productModifier) =>
      isProductModifierVisibleForVariation(productModifier, selectedVariation),
    );
    const visibleProductModifierIds = new Set(
      visibleProductModifiers.map((productModifier) => productModifier.id),
    );

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

      if (!visibleProductModifierIds.has(modifierOption.modifierId)) {
        throw validation(
          "orderItem.hiddenModifier",
          `Item #${itemPosition} contains a modifier that is not available for the selected variation of product "${product.name}"`,
        );
      }

      const totalPriceCents = calculateExtendedPriceCents(
        modifierOption.optionPriceCents,
        selectedModifier.quantity * itemInput.quantity,
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

    for (const productModifier of visibleProductModifiers) {
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
    const productCategoryIds = [
      ...new Set([
        ...(product.categoryId ? [product.categoryId] : []),
        ...product.categories.map((categoryLink) => categoryLink.categoryId),
      ]),
    ];
    const allProductCategories = [
      ...(product.category ? [product.category] : []),
      ...product.categories.map((categoryLink) => categoryLink.category),
    ];

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
      compoundComponents: [],
      modifiers: modifierRows,
      taxes: taxRows,
      workOrderSnapshot: {
        productKitchenName: product.kitchenName,
        variationSelections: buildWorkOrderVariationSelections(selectedVariation ?? null),
        modifiers: workOrderModifierSnapshots,
      },
      isPromotionEligible: allProductCategories.some((category) => category.isFourPlusOneEligible),
      isCashbackEligible: allProductCategories.some((category) => category.isCashbackEligible),
      productCategoryId: product.categoryId,
      productCategoryIds,
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
