const FLOAT_COMPARISON_EPSILON = 1e-8;
const BASE_100_SCALE_FACTOR = 100;

export function hasAtMostDecimalPlaces(value: number, decimalPlaces: number): boolean {
  const scaleFactor = 10 ** decimalPlaces;
  const scaledValue = Math.round((value + Number.EPSILON) * scaleFactor);

  return Math.abs(value * scaleFactor - scaledValue) < FLOAT_COMPARISON_EPSILON;
}

export function hasAtMostTwoDecimals(value: number): boolean {
  return hasAtMostDecimalPlaces(value, 2);
}

export function toScaledInteger(value: number, scaleFactor: number): number {
  return Math.round((value + Number.EPSILON) * scaleFactor);
}

export function fromScaledInteger(value: number, scaleFactor: number): number {
  return value / scaleFactor;
}

export function toBase100Integer(value: number): number {
  return toScaledInteger(value, BASE_100_SCALE_FACTOR);
}

export function fromBase100Integer(value: number): number {
  return fromScaledInteger(value, BASE_100_SCALE_FACTOR);
}
