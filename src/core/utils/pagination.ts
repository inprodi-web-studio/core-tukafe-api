import type { AnyColumn, SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgSelect } from "drizzle-orm/pg-core";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_PAGE_SIZE = 100;

type PaginationInput = number | string | null | undefined;
type CountDistinctTarget = AnyColumn | SQL<unknown>;
type PgPaginationExecutor = Pick<PgDatabase<any, any, any>, "select">;
type RowOf<TSelect extends PgSelect> = Awaited<ReturnType<TSelect["execute"]>>[number];

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResult<TData> {
  data: TData[];
  pagination: PaginationMeta;
}

interface BasePaginateParams<TSelect extends PgSelect> {
  executor: PgPaginationExecutor;
  createQuery: () => TSelect;
  orderBy: readonly [SQL, ...SQL[]];
  page?: PaginationInput;
  pageSize?: PaginationInput;
  maxPageSize?: PaginationInput;
  countDistinctOn?: CountDistinctTarget;
}

export interface PaginateParams<TSelect extends PgSelect> extends BasePaginateParams<TSelect> {
  mapRow?: undefined;
}

export interface PaginateMappedParams<TSelect extends PgSelect, TMapped>
  extends BasePaginateParams<TSelect> {
  mapRow: (row: RowOf<TSelect>) => TMapped;
}

function normalizePositiveInteger(value: PaginationInput, fallback: number): number {
  const parsed = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(parsed));
}

export async function paginate<TSelect extends PgSelect>(
  params: PaginateParams<TSelect>,
): Promise<PaginatedResult<RowOf<TSelect>>>;
export async function paginate<TSelect extends PgSelect, TMapped>(
  params: PaginateMappedParams<TSelect, TMapped>,
): Promise<PaginatedResult<TMapped>>;
export async function paginate<TSelect extends PgSelect, TMapped = RowOf<TSelect>>(
  params: PaginateParams<TSelect> | PaginateMappedParams<TSelect, TMapped>,
): Promise<PaginatedResult<TMapped>> {
  const {
    executor,
    createQuery,
    orderBy,
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    maxPageSize = DEFAULT_MAX_PAGE_SIZE,
    countDistinctOn,
  } = params;

  const normalizedMaxPageSize = normalizePositiveInteger(maxPageSize, DEFAULT_MAX_PAGE_SIZE);
  const normalizedPage = normalizePositiveInteger(page, DEFAULT_PAGE);
  const normalizedPageSize = Math.min(
    normalizedMaxPageSize,
    normalizePositiveInteger(pageSize, DEFAULT_PAGE_SIZE),
  );
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const countQuery = createQuery().$dynamic();
  const dataQuery = createQuery().$dynamic();

  const countSource = countQuery.as("pagination_source");
  const totalItemsExpression = countDistinctOn
    ? sql<number>`cast(count(distinct ${countDistinctOn}) as int)`
    : sql<number>`cast(count(*) as int)`;

  const countPromise: Promise<Array<{ totalItems: number }>> = executor
    .select({
      totalItems: totalItemsExpression,
    })
    .from(countSource as never)
    .execute();

  dataQuery.orderBy(...orderBy);
  dataQuery.offset(offset);
  dataQuery.limit(normalizedPageSize);

  const [rows, countRows] = await Promise.all([dataQuery.execute(), countPromise]);

  const totalItems = Number(countRows[0]?.totalItems ?? 0);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / normalizedPageSize);
  const data = "mapRow" in params && params.mapRow
    ? rows.map((row) => params.mapRow(row))
    : (rows as TMapped[]);

  return {
    data,
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalItems,
      totalPages,
    },
  };
}
