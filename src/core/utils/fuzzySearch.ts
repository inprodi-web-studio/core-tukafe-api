import type { AnyColumn, SQL } from "drizzle-orm";
import { desc, sql } from "drizzle-orm";

const DEFAULT_FUZZY_THRESHOLD = 0.25;
const DEFAULT_MIN_QUERY_LENGTH = 2;

export type FuzzySearchValue = AnyColumn | SQL<unknown>;

export interface BuildFuzzySearchOptions {
  query?: string | null;
  values: readonly FuzzySearchValue[];
  threshold?: number;
  minQueryLength?: number;
  useContainsFallback?: boolean;
  tieBreakers?: readonly SQL[];
}

export interface FuzzySearchResult {
  hasSearch: boolean;
  where?: SQL<boolean>;
  orderBy?: readonly [SQL, ...SQL[]];
  score?: SQL<number>;
  searchText?: SQL<string>;
  contains?: SQL<boolean>;
}

function clampFuzzyThreshold(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Requires the PostgreSQL `unaccent` and `pg_trgm` extensions.
export function buildFuzzySearch(options: BuildFuzzySearchOptions): FuzzySearchResult {
  const {
    query,
    values,
    threshold = DEFAULT_FUZZY_THRESHOLD,
    minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
    useContainsFallback = true,
    tieBreakers = [],
  } = options;

  const normalizedQuery = (query ?? "").trim();

  if (normalizedQuery.length < minQueryLength || values.length === 0) {
    return {
      hasSearch: false,
    };
  }

  const normalizedThreshold = clampFuzzyThreshold(threshold);
  const searchValues = values.map((value) => sql`${value}`);

  const searchText = sql<string>`
    lower(unaccent(concat_ws(' ', ${sql.join(searchValues, sql`, `)})))
  `;

  const searchQuery = sql<string>`lower(unaccent(${normalizedQuery}))`;
  const wordScore = sql<number>`word_similarity(${searchQuery}, ${searchText})`;
  const fullScore = sql<number>`similarity(${searchText}, ${searchQuery})`;
  const score = sql<number>`greatest(${wordScore}, ${fullScore})`;
  const contains = sql<boolean>`strpos(${searchText}, ${searchQuery}) > 0`;

  const where = useContainsFallback
    ? sql<boolean>`(${score} >= ${normalizedThreshold} OR ${contains})`
    : sql<boolean>`${score} >= ${normalizedThreshold}`;

  return {
    hasSearch: true,
    where,
    orderBy: [desc(score), ...tieBreakers],
    score,
    searchText,
    contains,
  };
}
