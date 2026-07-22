export interface VariationSelection {
  groupName: string;
  optionName: string;
}

export interface PriceVariation {
  key: string;
  currentPriceCents: number;
  selections: VariationSelection[];
}

export interface CalculatedVariationPrice {
  key: string;
  currentPriceCents: number;
  nextPriceCents: number;
  rule: string;
}

const REGULAR_MILK_OPTIONS = new Set(["entera", "light"]);
const PREMIUM_MILK_OPTIONS = new Set(["almendra", "avena oatly", "coco", "soya vainilla"]);

function canonicalize(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getMilkOption(variation: PriceVariation) {
  return variation.selections.find(
    (selection) => canonicalize(selection.groupName) === "tipo de leche",
  )?.optionName;
}

function getNonMilkKey(variation: PriceVariation) {
  return variation.selections
    .filter((selection) => canonicalize(selection.groupName) !== "tipo de leche")
    .map(
      (selection) => `${canonicalize(selection.groupName)}=${canonicalize(selection.optionName)}`,
    )
    .sort()
    .join("|");
}

function describePriceRule(otherDeltaCents: number, milkOption: string | undefined) {
  const parts = ["precio base"];

  if (otherDeltaCents !== 0) {
    parts.push(`${otherDeltaCents > 0 ? "+" : ""}$${(otherDeltaCents / 100).toFixed(2)} variación`);
  }

  const milkKey = milkOption ? canonicalize(milkOption) : null;
  if (milkKey === "deslactosada") {
    parts.push("+$10.00 leche deslactosada");
  } else if (milkKey && PREMIUM_MILK_OPTIONS.has(milkKey)) {
    parts.push("+$12.00 leche premium");
  }

  return parts.join(" ");
}

export function calculateVariationPrices(
  basePriceCents: number,
  variations: PriceVariation[],
): CalculatedVariationPrice[] {
  if (basePriceCents < 0 || !Number.isInteger(basePriceCents)) {
    throw new Error("El precio base debe ser un número entero de centavos no negativo.");
  }

  if (variations.length === 0) {
    return [];
  }

  const regularCandidates = variations.filter((variation) => {
    const milkOption = getMilkOption(variation);
    return !milkOption || REGULAR_MILK_OPTIONS.has(canonicalize(milkOption));
  });

  if (regularCandidates.length === 0) {
    throw new Error("No existe una variación base con leche Entera o Light.");
  }

  const currentBaseCents = Math.min(
    ...regularCandidates.map((variation) => variation.currentPriceCents),
  );
  const regularPriceBySelection = new Map<string, number>();

  for (const variation of regularCandidates) {
    const milkOption = getMilkOption(variation);
    if (!milkOption) {
      continue;
    }

    const nonMilkKey = getNonMilkKey(variation);
    const existingPrice = regularPriceBySelection.get(nonMilkKey);

    if (existingPrice !== undefined && existingPrice !== variation.currentPriceCents) {
      throw new Error(
        `Las opciones Entera y Light no tienen el mismo precio para la combinación "${nonMilkKey}".`,
      );
    }

    regularPriceBySelection.set(nonMilkKey, variation.currentPriceCents);
  }

  return variations.map((variation) => {
    const milkOption = getMilkOption(variation);
    const milkKey = milkOption ? canonicalize(milkOption) : null;
    let otherDeltaCents = variation.currentPriceCents - currentBaseCents;
    let milkDeltaCents = 0;

    if (milkKey) {
      const regularPrice = regularPriceBySelection.get(getNonMilkKey(variation));
      if (regularPrice === undefined) {
        throw new Error(
          `No existe contraparte Entera o Light para la variación "${variation.key}" con leche ${milkOption}.`,
        );
      }

      otherDeltaCents = regularPrice - currentBaseCents;

      if (milkKey === "deslactosada") {
        milkDeltaCents = 1_000;
      } else if (PREMIUM_MILK_OPTIONS.has(milkKey)) {
        milkDeltaCents = 1_200;
      } else if (!REGULAR_MILK_OPTIONS.has(milkKey)) {
        throw new Error(`Tipo de leche no soportado para precio: "${milkOption}".`);
      }
    }

    return {
      key: variation.key,
      currentPriceCents: variation.currentPriceCents,
      nextPriceCents: basePriceCents + otherDeltaCents + milkDeltaCents,
      rule: describePriceRule(otherDeltaCents, milkOption),
    };
  });
}

export function canonicalizePriceName(value: string) {
  return canonicalize(value);
}

export function buildVariationSelectionKey(selections: VariationSelection[]) {
  return selections
    .map(
      (selection) => `${canonicalize(selection.groupName)}=${canonicalize(selection.optionName)}`,
    )
    .sort()
    .join("|");
}
