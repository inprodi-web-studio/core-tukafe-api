export interface CompoundAvailabilitySlot {
  optionProductIds: string[];
}

export function hasAvailableCompoundConfiguration(
  slots: CompoundAvailabilitySlot[],
  activeProductIds: ReadonlySet<string>,
): boolean {
  return (
    slots.length >= 2 &&
    slots.every((slot) =>
      slot.optionProductIds.some((productId) => activeProductIds.has(productId)),
    )
  );
}
