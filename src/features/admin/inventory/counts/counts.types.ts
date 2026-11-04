import type { InventoryActorContext } from "../inventory.types";
import type {
  AddCountLotBody,
  CountDetail,
  CountList,
  CountParams,
  CountVersionBody,
  CreateCountBody,
  ListCountsQuery,
  RefreshCountBody,
  SaveCountBody,
} from "./counts.schemas";

export type CountContext = InventoryActorContext & CountParams;
export type CountLocationContext = InventoryActorContext & { locationId: string };
export interface AdminInventoryCountsService {
  list(input: CountLocationContext & ListCountsQuery): Promise<CountList>;
  create(input: CountLocationContext & CreateCountBody): Promise<CountDetail>;
  get(input: CountContext): Promise<CountDetail>;
  save(input: CountContext & SaveCountBody): Promise<CountDetail>;
  addLot(input: CountContext & AddCountLotBody): Promise<CountDetail>;
  refresh(input: CountContext & RefreshCountBody): Promise<CountDetail>;
  apply(input: CountContext & CountVersionBody): Promise<CountDetail>;
  cancel(input: CountContext & CountVersionBody): Promise<CountDetail>;
}
