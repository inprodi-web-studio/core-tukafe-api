import type {
  InventoryAdjustmentDirection,
  InventoryAdjustmentReason,
  InventoryItemKind,
  InventoryLocationType,
  ProductInventoryTrackingMode,
  InventoryOverrideTargetType,
} from "@core/db/schemas";

export interface InventoryActorContext {
  userId: string;
  organizationId: string;
}

export interface InventoryLocationResponse {
  id: string;
  name: string;
  type: InventoryLocationType;
  organizationId: string | null;
  timezone: string;
  isDefaultSalesLocation: boolean;
  salesEnforcementEnabled: boolean;
}

export interface InventoryItemResponse {
  id: string;
  kind: InventoryItemKind;
  sourceId: string;
  name: string;
  isTracked: boolean;
  tracksLots: boolean;
  isPerishable: boolean;
  expirationWarningDays: number;
  unit: {
    id: string;
    name: string;
    abbreviation: string;
    precision: number;
  };
}

export interface InventoryStockResponse extends InventoryItemResponse {
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  deficitQuantity: number;
  expiredQuantity: number;
  lowStockThreshold: number | null;
  isLowStock: boolean;
  lotCount: number;
}

export interface InventoryAdjustmentLineInput {
  inventoryItemId: string;
  quantity: number;
  lotId?: string | null;
  lotCode?: string | null;
  expiresOn?: string | null;
}

export interface CreateInventoryAdjustmentInput extends InventoryActorContext {
  locationId: string;
  direction: InventoryAdjustmentDirection;
  reason: InventoryAdjustmentReason;
  observations?: string | null;
  lines: InventoryAdjustmentLineInput[];
}

export interface InventoryAdjustmentResponse {
  id: string;
  locationId: string;
  direction: InventoryAdjustmentDirection;
  reason: InventoryAdjustmentReason;
  observations: string | null;
  reversedAt: Date | null;
  reversalAdjustmentId: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string };
  lines: Array<{
    id: string;
    inventoryItemId: string;
    itemName: string;
    lotId: string;
    lotCode: string | null;
    expiresOn: string | null;
    quantity: number;
  }>;
}

export interface InventoryActivationPreview {
  locationId: string;
  openWorkOrders: number;
  activeReservations: number;
  trackedItems: number;
  itemsWithoutStock: number;
  canActivate: boolean;
}

export interface ProductInventoryConfiguration {
  productId: string;
  productType: "simple" | "assembled" | "compound";
  trackingMode: ProductInventoryTrackingMode;
  item: InventoryItemResponse | null;
  variations: InventoryItemResponse[];
}

export interface InventoryAvailabilityOverrideResponse {
  id: string;
  locationId: string;
  targetType: InventoryOverrideTargetType;
  targetId: string;
  targetName: string;
  reason: string;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
}

export interface InventoryAvailabilityTargetResponse {
  targetType: InventoryOverrideTargetType;
  targetId: string;
  targetName: string;
}

export interface AdminInventoryService {
  listLocations(context: InventoryActorContext): Promise<InventoryLocationResponse[]>;
  createDistributionCenter(
    input: InventoryActorContext & { name: string; timezone: string },
  ): Promise<InventoryLocationResponse>;
  listItems(context: InventoryActorContext): Promise<InventoryItemResponse[]>;
  updateItemConfiguration(
    input: InventoryActorContext & {
      inventoryItemId: string;
      isTracked?: boolean;
      tracksLots?: boolean;
      isPerishable?: boolean;
      expirationWarningDays?: number;
    },
  ): Promise<InventoryItemResponse>;
  getProductConfiguration(
    context: InventoryActorContext & { productId: string },
  ): Promise<ProductInventoryConfiguration>;
  updateProductConfiguration(
    input: InventoryActorContext & {
      productId: string;
      trackingMode: ProductInventoryTrackingMode;
      tracksLots: boolean;
      isPerishable: boolean;
      expirationWarningDays: number;
      variations?: Array<{
        variationId: string;
        tracksLots: boolean;
        isPerishable: boolean;
        expirationWarningDays: number;
      }>;
    },
  ): Promise<ProductInventoryConfiguration>;
  listStocks(
    context: InventoryActorContext & { locationId: string },
  ): Promise<InventoryStockResponse[]>;
  updateLocationItem(
    input: InventoryActorContext & {
      locationId: string;
      inventoryItemId: string;
      lowStockThreshold: number | null;
    },
  ): Promise<void>;
  listAvailabilityOverrides(
    context: InventoryActorContext & { locationId: string },
  ): Promise<InventoryAvailabilityOverrideResponse[]>;
  listAvailabilityTargets(): Promise<InventoryAvailabilityTargetResponse[]>;
  createAvailabilityOverride(
    input: InventoryActorContext & {
      locationId: string;
      targetType: InventoryOverrideTargetType;
      targetId: string;
      reason: string;
      startsAt?: string;
      endsAt?: string | null;
    },
  ): Promise<InventoryAvailabilityOverrideResponse>;
  clearAvailabilityOverride(
    input: InventoryActorContext & { locationId: string; overrideId: string },
  ): Promise<void>;
  listLots(
    context: InventoryActorContext & { locationId: string; inventoryItemId?: string },
  ): Promise<unknown[]>;
  getSummary(
    context: InventoryActorContext & { locationId: string },
  ): Promise<Record<string, number>>;
  listAdjustments(
    context: InventoryActorContext & { locationId: string },
  ): Promise<InventoryAdjustmentResponse[]>;
  createAdjustment(input: CreateInventoryAdjustmentInput): Promise<InventoryAdjustmentResponse>;
  reverseAdjustment(
    input: InventoryActorContext & { locationId: string; adjustmentId: string },
  ): Promise<InventoryAdjustmentResponse>;
  getActivationPreview(
    context: InventoryActorContext & { locationId: string },
  ): Promise<InventoryActivationPreview>;
  activateLocation(
    input: InventoryActorContext & {
      locationId: string;
      previewAcknowledged: boolean;
      confirmZeroBalances: boolean;
    },
  ): Promise<InventoryLocationResponse>;
  deactivateLocation(
    input: InventoryActorContext & { locationId: string; reason: string },
  ): Promise<InventoryLocationResponse>;
}
