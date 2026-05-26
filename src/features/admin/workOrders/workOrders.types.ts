import type { WorkOrder, WorkOrderStatus } from "@core/db/schemas";
import type { ListQueryParams } from "@core/types";
import type { PaginatedResult } from "@core/utils";

export type WorkOrderListStatus = WorkOrderStatus | "all";

export interface ListWorkOrdersServiceParams extends ListQueryParams {
  organizationId: string;
  status?: WorkOrderListStatus;
}

export interface CompleteWorkOrderServiceParams {
  organizationId: string;
  workOrderId: string;
  completedByUserId: string;
}

export type WorkOrderResponse = WorkOrder;

export interface AdminWorkOrdersService {
  list(input: ListWorkOrdersServiceParams): Promise<PaginatedResult<WorkOrderResponse>>;
  complete(input: CompleteWorkOrderServiceParams): Promise<WorkOrderResponse>;
}
