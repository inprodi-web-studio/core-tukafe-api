import { timestamp } from "drizzle-orm/pg-core";

interface GenerateTimestamps {
  withDeletedAt?: boolean;
}

export function generateTimestamps(options?: { withDeletedAt?: false }): {
  updatedAt: ReturnType<typeof timestamp>;
  createdAt: ReturnType<typeof timestamp>;
};

export function generateTimestamps(options: { withDeletedAt: true }): {
  updatedAt: ReturnType<typeof timestamp>;
  createdAt: ReturnType<typeof timestamp>;
  deletedAt: ReturnType<typeof timestamp>;
};

export function generateTimestamps({ withDeletedAt = false }: GenerateTimestamps = {}): {
  updatedAt: ReturnType<typeof timestamp>;
  createdAt: ReturnType<typeof timestamp>;
  deletedAt?: ReturnType<typeof timestamp>;
} {
  const base = {
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  };

  if (withDeletedAt) {
    return {
      ...base,
      deletedAt: timestamp("deleted_at", { mode: "date" }),
    };
  }

  return base;
}

export interface Timestamps {
  updatedAt: Date;
  createdAt: Date;
  deletedAt: Date | null;
}
