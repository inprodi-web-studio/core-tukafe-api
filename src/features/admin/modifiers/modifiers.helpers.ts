import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES, normalizeString, toBase100Integer } from "@core/utils";
import type {
  CreateModifierOptionIngredientParams,
  CreateModifierOptionParams,
  CreateModifierOptionSupplyParams,
  CreateModifierServiceParams,
  ModifierResponse,
} from "./modifiers.types";

function normalizeModifierOptionIngredientInput({
  ingredientId,
  quantity,
}: CreateModifierOptionIngredientParams) {
  return {
    ingredientId,
    quantity,
  };
}

function normalizeModifierOptionSupplyInput({
  supplyId,
  quantity,
}: CreateModifierOptionSupplyParams) {
  return {
    supplyId,
    quantity,
  };
}

function normalizeModifierOptionInput({
  name,
  kitchenName,
  customerName,
  price,
  isDefault,
  ingredients,
  supplies,
}: CreateModifierOptionParams) {
  return {
    name: normalizeString(name, { trim: true, collapseWhitespace: true }),
    kitchenName: normalizeString(kitchenName, { trim: true, collapseWhitespace: true }),
    customerName: normalizeString(customerName, { trim: true, collapseWhitespace: true }),
    priceCents: price == null ? 0 : toBase100Integer(price),
    isDefault: isDefault ?? false,
    ingredients: (ingredients ?? []).map(normalizeModifierOptionIngredientInput),
    supplies: (supplies ?? []).map(normalizeModifierOptionSupplyInput),
  };
}

export function normalizeModifierInput({
  name,
  kitchenName,
  customerLabel,
  multiSelect,
  minSelect,
  maxSelect,
  options,
}: CreateModifierServiceParams) {
  return {
    name: normalizeString(name, { trim: true, collapseWhitespace: true }),
    kitchenName: normalizeString(kitchenName, { trim: true, collapseWhitespace: true }),
    customerLabel: normalizeString(customerLabel, { trim: true, collapseWhitespace: true }),
    multiSelect: multiSelect ?? false,
    minSelect: minSelect ?? 0,
    maxSelect: maxSelect ?? null,
    options: options.map(normalizeModifierOptionInput),
  };
}

function sortModifierResponse(modifier: ModifierResponse): ModifierResponse {
  return {
    ...modifier,
    options: [...modifier.options]
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        if (left.name !== right.name) {
          return left.name.localeCompare(right.name);
        }

        return left.id.localeCompare(right.id);
      })
      .map((option) => ({
        ...option,
        ingredients: [...option.ingredients].sort((left, right) => {
          if (left.ingredient.name !== right.ingredient.name) {
            return left.ingredient.name.localeCompare(right.ingredient.name);
          }

          return left.ingredient.id.localeCompare(right.ingredient.id);
        }),
        supplies: [...option.supplies].sort((left, right) => {
          if (left.supply.name !== right.supply.name) {
            return left.supply.name.localeCompare(right.supply.name);
          }

          return left.supply.id.localeCompare(right.supply.id);
        }),
      })),
  };
}

export { sortModifierResponse as mapModifierResponse };
export { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES };
