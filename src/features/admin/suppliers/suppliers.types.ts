import type { PaginatedResult } from "@core/utils";

export type SupplierStatus = "active" | "inactive";
export type SupplierItemType = "ingredient" | "supply";

export interface SupplierResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: SupplierStatus;
  ingredientCount: number;
  supplyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierServiceParams {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface UpdateSupplierServiceParams {
  name?: string;
  email?: string | null;
  phone?: string | null;
}

export interface SupplierListParams {
  search?: string | null;
  page?: number;
  pageSize?: number;
  status?: SupplierStatus | "all";
}

export interface PresentationInput {
  name: string;
  contentQuantity: number;
  priceCents: number;
  note?: string | null;
  isDefault?: boolean;
}

export interface SupplierPresentationResponse {
  id: string;
  name: string;
  contentQuantity: number;
  isDefault: boolean;
  status: SupplierStatus;
  currentCost: SupplierCostResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierCostResponse {
  id: string;
  priceCents: number;
  unitCostPerBaseUnit: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  note: string | null;
  createdBy: { id: string; name: string; email: string } | null;
}

export interface SupplierItemResponse {
  id: string;
  itemType: SupplierItemType;
  status: SupplierStatus;
  item: {
    id: string;
    name: string;
    baseUnit: { id: string; name: string; abbreviation: string; precision: number };
  };
  presentations: SupplierPresentationResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminSuppliersService {
  get(
    id: string,
    config?: { safe?: boolean; includeInactive?: boolean },
  ): Promise<SupplierResponse | null>;
  list(input?: SupplierListParams): Promise<PaginatedResult<SupplierResponse>>;
  create(input: CreateSupplierServiceParams): Promise<SupplierResponse>;
  update(id: string, input: UpdateSupplierServiceParams): Promise<SupplierResponse>;
  deactivate(id: string): Promise<void>;
  restore(id: string): Promise<SupplierResponse>;
  listItems(
    supplierId: string,
    input: SupplierListParams & { itemType: SupplierItemType },
  ): Promise<PaginatedResult<SupplierItemResponse>>;
  assignItem(
    supplierId: string,
    input: { itemType: SupplierItemType; itemId: string; presentation: PresentationInput },
    actorUserId: string,
  ): Promise<SupplierItemResponse>;
  deactivateItem(supplierId: string, supplierItemId: string): Promise<void>;
  restoreItem(supplierId: string, supplierItemId: string): Promise<SupplierItemResponse>;
  createPresentation(
    supplierId: string,
    supplierItemId: string,
    input: PresentationInput,
    actorUserId: string,
  ): Promise<SupplierPresentationResponse>;
  deactivatePresentation(
    supplierId: string,
    supplierItemId: string,
    presentationId: string,
  ): Promise<void>;
  restorePresentation(
    supplierId: string,
    supplierItemId: string,
    presentationId: string,
  ): Promise<SupplierPresentationResponse>;
  setDefaultPresentation(
    supplierId: string,
    supplierItemId: string,
    presentationId: string,
  ): Promise<SupplierPresentationResponse>;
  addCost(
    supplierId: string,
    supplierItemId: string,
    presentationId: string,
    input: { priceCents: number; note?: string | null },
    actorUserId: string,
  ): Promise<SupplierCostResponse>;
  listCosts(
    supplierId: string,
    supplierItemId: string,
    presentationId: string,
    input?: { page?: number; pageSize?: number },
  ): Promise<PaginatedResult<SupplierCostResponse>>;
}
