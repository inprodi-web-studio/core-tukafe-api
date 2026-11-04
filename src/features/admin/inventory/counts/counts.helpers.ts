import { hasAtMostDecimalPlaces, validation } from "@core/utils";
import type { InventoryCountItemSnapshot } from "@core/db/schemas";

export function roundCountQuantity(n: number) {
  return Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;
}
export function validateCountQuantity(n: number | null, precision: number) {
  if (
    n !== null &&
    (!Number.isFinite(n) || n < 0 || n > 999999.999999 || !hasAtMostDecimalPlaces(n, precision))
  ) {
    throw validation(
      "inventoryCount.invalidQuantity",
      "La cantidad no respeta la precisión de la unidad base",
    );
  }
}
export function countConfigurationMatches(
  a: InventoryCountItemSnapshot,
  b?: InventoryCountItemSnapshot,
) {
  return Boolean(
    b &&
    b.isTracked &&
    a.unit.id === b.unit.id &&
    a.unit.precision === b.unit.precision &&
    a.tracksLots === b.tracksLots &&
    a.isPerishable === b.isPerishable,
  );
}
export function normalizeCountLot(code?: string | null) {
  const lotCode = code?.trim().replace(/\s+/g, " ") || null;
  return { lotCode, normalizedLotCode: lotCode?.toLocaleLowerCase("es-MX") ?? null };
}
export function countLineKey(
  item: InventoryCountItemSnapshot,
  line: { lotId: string | null; lotCode: string | null; expiresOn: string | null },
) {
  if (item.tracksLots)
    return (
      line.lotId ??
      `${normalizeCountLot(line.lotCode).normalizedLotCode ?? ""}:${line.expiresOn ?? ""}`
    );
  if (!item.isPerishable) return "aggregate";
  return `${normalizeCountLot(line.lotCode).normalizedLotCode ?? ""}:${line.expiresOn ?? ""}`;
}

export function groupCountBalances(
  item: InventoryCountItemSnapshot,
  balances: Array<{
    lotId: string;
    lotCode: string | null;
    expiresOn: string | null;
    onHandQuantity: number;
  }>,
) {
  const groups = new Map<
    string,
    {
      lotId: string | null;
      lotCode: string | null;
      expiresOn: string | null;
      onHandQuantity: number;
    }
  >();
  if (!item.tracksLots && !item.isPerishable)
    groups.set("aggregate", { lotId: null, lotCode: null, expiresOn: null, onHandQuantity: 0 });
  for (const b of balances) {
    const key = countLineKey(item, b);
    const current = groups.get(key);
    if (current)
      current.onHandQuantity = roundCountQuantity(current.onHandQuantity + b.onHandQuantity);
    else
      groups.set(key, {
        lotId: item.tracksLots ? b.lotId : null,
        lotCode: b.lotCode,
        expiresOn: b.expiresOn,
        onHandQuantity: b.onHandQuantity,
      });
  }
  return [...groups.values()];
}

export function validateCountLot(
  item: InventoryCountItemSnapshot,
  lotCode: string | null,
  expiresOn: string | null,
) {
  if (item.tracksLots && !lotCode)
    throw validation("inventory.lotCodeRequired", "Este artículo requiere código de lote");
  if (item.isPerishable && !expiresOn)
    throw validation("inventory.expirationRequired", "Este artículo requiere fecha de caducidad");
  if (!item.tracksLots && !item.isPerishable)
    throw validation(
      "inventoryCount.lotNotSupported",
      "Este artículo se cuenta con una sola cantidad",
    );
  // Expired stock is a physical fact and is intentionally accepted by counts.
}

/** Distribute an aggregate count over internal partitions without changing reservations. */
export function distributeCount(
  counted: number,
  balances: Array<{ lotId: string; onHandQuantity: number; reservedQuantity?: number }>,
) {
  const targets = balances.map((balance) => ({ ...balance, target: balance.onHandQuantity }));
  const total = roundCountQuantity(balances.reduce((sum, b) => sum + b.onHandQuantity, 0));
  let remaining = roundCountQuantity(total - counted);
  if (remaining > 0) {
    // First remove unreserved physical stock. Only create deficits when the
    // aggregate physical count really cannot satisfy the existing reservations.
    for (const preserveReservations of [true, false]) {
      for (const b of targets) {
        const removable = preserveReservations
          ? Math.max(b.target - (b.reservedQuantity ?? 0), 0)
          : b.target;
        const reduction = Math.min(removable, remaining);
        b.target = roundCountQuantity(b.target - reduction);
        remaining = roundCountQuantity(remaining - reduction);
      }
    }
  } else if (remaining < 0 && targets[0]) {
    for (const b of targets) {
      const addition = Math.min(Math.max((b.reservedQuantity ?? 0) - b.target, 0), -remaining);
      b.target = roundCountQuantity(b.target + addition);
      remaining = roundCountQuantity(remaining + addition);
    }
    targets[0].target = roundCountQuantity(targets[0].target - remaining);
  }
  return targets;
}
