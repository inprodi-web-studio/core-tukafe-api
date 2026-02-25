import { timestamp } from "drizzle-orm/pg-core";

interface GenerateTimestamps {
  withDeletedAt?: boolean;
}

export const generateTimestamps = ({ withDeletedAt = false }: GenerateTimestamps = {}) => ({
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  ...(withDeletedAt && { deletedAt: timestamp("deleted_at") }),
});

export interface Timestamps {
  updatedAt: Date;
  createdAt: Date;
  deletedAt: Date | null;
}
