import type { PaginatedResult } from "@core/utils";
import type { PurchaseOrderEventType, PurchaseOrderStatus } from "@core/db/schemas";

export interface PurchaseOrderActorContext {
  userId: string;
  organizationId: string;
}

export interface PurchaseOrderDraftLineInput {
  presentationId: string;
  quantity: number;
  unitPriceCents: number;
  taxIds: string[];
}

export interface PurchaseOrderDraftInput {
  supplierId: string;
  locationId: string;
  quoteReference?: string | null;
  observations?: string | null;
  expectedDeliveryOn?: string | null;
  lines: PurchaseOrderDraftLineInput[];
}

export interface PurchaseReceiptAllocationInput {
  purchaseOrderItemId: string;
  presentationQuantity: number;
  lotCode?: string | null;
  expiresOn?: string | null;
}

export interface PurchaseReceiptInput {
  receivedOn: string;
  supplierDocumentReference?: string | null;
  observations?: string | null;
  allocations: PurchaseReceiptAllocationInput[];
}

export interface PurchaseOrderOptionsResponse {
  locations: Array<{
    id: string;
    name: string;
    type: "branch" | "distribution_center";
    timezone: string;
  }>;
  suppliers: Array<{ id: string; name: string }>;
  taxes: Array<{ id: string; name: string; rate: number }>;
}

export interface PurchaseOrderCatalogPresentation {
  id: string;
  supplierItemId: string;
  itemType: "ingredient" | "supply";
  itemId: string;
  itemName: string;
  presentationName: string;
  contentQuantity: number;
  referencePriceCents: number | null;
  isDefault: boolean;
  inventory: {
    itemId: string | null;
    isTracked: boolean;
    tracksLots: boolean;
    isPerishable: boolean;
  };
  baseUnit: {
    id: string;
    name: string;
    abbreviation: string;
    precision: number;
  };
  defaultTaxIds: string[];
}

export interface PurchaseOrderListItem {
  id: string;
  folio: string;
  status: PurchaseOrderStatus;
  supplier: { id: string; name: string };
  location: { id: string; name: string; type: "branch" | "distribution_center" };
  currency: "MXN";
  expectedDeliveryOn: string | null;
  isOverdue: boolean;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  receivedTotalCents: number;
  pendingTotalCents: number;
  itemCount: number;
  createdAt: Date;
  issuedAt: Date | null;
}

export interface PurchaseOrderLineResponse {
  id: string;
  presentationId: string;
  supplierItemId: string;
  itemType: "ingredient" | "supply";
  itemName: string;
  presentationName: string;
  inventoryItemId: string | null;
  isTracked: boolean;
  tracksLots: boolean;
  isPerishable: boolean;
  baseUnit: { id: string; name: string; abbreviation: string; precision: number };
  contentQuantity: number;
  orderedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  unitPriceCents: number;
  baseUnitCost: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  receivedSubtotalCents: number;
  receivedTaxCents: number;
  receivedTotalCents: number;
  taxes: Array<{ id: string; name: string; rate: number; amountCents: number }>;
}

export interface PurchaseReceiptResponse {
  id: string;
  folio: string;
  sequence: number;
  status: "applied" | "reversed";
  receivedOn: string;
  supplierDocumentReference: string | null;
  observations: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  correctsReceiptId: string | null;
  replacementReceiptId: string | null;
  receivedBy: { id: string; name: string };
  reversedAt: Date | null;
  reversedBy: { id: string; name: string } | null;
  reversalReason: string | null;
  createdAt: Date;
  allocations: Array<{
    id: string;
    purchaseOrderItemId: string;
    itemName: string;
    presentationName: string;
    presentationQuantity: number;
    baseQuantity: number;
    baseUnitAbbreviation: string;
    lotCode: string | null;
    expiresOn: string | null;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
  }>;
}

export interface PurchaseOrderEventResponse {
  id: string;
  type: PurchaseOrderEventType;
  metadata: Record<string, unknown>;
  actor: { id: string; name: string };
  createdAt: Date;
}

export interface PurchaseOrderDetail extends PurchaseOrderListItem {
  quoteReference: string | null;
  observations: string | null;
  locationTimezone: string;
  cancellationReason: string | null;
  closeReason: string | null;
  lines: PurchaseOrderLineResponse[];
  receipts: PurchaseReceiptResponse[];
  events: PurchaseOrderEventResponse[];
}

export interface PurchaseOrderListInput {
  page?: number;
  pageSize?: number;
  search?: string | null;
  status?: PurchaseOrderStatus | "all";
  supplierId?: string | null;
  locationId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface AdminPurchaseOrdersService {
  options(context: PurchaseOrderActorContext): Promise<PurchaseOrderOptionsResponse>;
  catalog(
    context: PurchaseOrderActorContext & { supplierId: string },
  ): Promise<PurchaseOrderCatalogPresentation[]>;
  list(
    context: PurchaseOrderActorContext & PurchaseOrderListInput,
  ): Promise<PaginatedResult<PurchaseOrderListItem>>;
  get(
    context: PurchaseOrderActorContext & { purchaseOrderId: string },
  ): Promise<PurchaseOrderDetail>;
  create(
    context: PurchaseOrderActorContext & PurchaseOrderDraftInput,
  ): Promise<PurchaseOrderDetail>;
  updateDraft(
    context: PurchaseOrderActorContext & PurchaseOrderDraftInput & { purchaseOrderId: string },
  ): Promise<PurchaseOrderDetail>;
  deleteDraft(context: PurchaseOrderActorContext & { purchaseOrderId: string }): Promise<void>;
  issue(
    context: PurchaseOrderActorContext & { purchaseOrderId: string },
  ): Promise<PurchaseOrderDetail>;
  updateMetadata(
    context: PurchaseOrderActorContext & {
      purchaseOrderId: string;
      expectedDeliveryOn?: string | null;
      observations?: string | null;
    },
  ): Promise<PurchaseOrderDetail>;
  cancel(
    context: PurchaseOrderActorContext & { purchaseOrderId: string; reason: string },
  ): Promise<PurchaseOrderDetail>;
  close(
    context: PurchaseOrderActorContext & { purchaseOrderId: string; reason: string },
  ): Promise<PurchaseOrderDetail>;
  duplicate(
    context: PurchaseOrderActorContext & { purchaseOrderId: string },
  ): Promise<PurchaseOrderDetail>;
  receive(
    context: PurchaseOrderActorContext & PurchaseReceiptInput & { purchaseOrderId: string },
  ): Promise<PurchaseOrderDetail>;
  reverseReceipt(
    context: PurchaseOrderActorContext & {
      purchaseOrderId: string;
      receiptId: string;
      reason: string;
    },
  ): Promise<PurchaseOrderDetail>;
  correctReceipt(
    context: PurchaseOrderActorContext &
      PurchaseReceiptInput & {
        purchaseOrderId: string;
        receiptId: string;
        reason: string;
      },
  ): Promise<PurchaseOrderDetail>;
}
