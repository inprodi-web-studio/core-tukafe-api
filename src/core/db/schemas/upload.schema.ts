import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";

export const uploadVisibilityEnum = pgEnum("upload_visibility", ["PUBLIC", "PRIVATE"]);
export const uploadEntityTypeEnum = pgEnum("upload_entity_type", [
  "product",
  "variation",
  "ingredient",
  "supply",
  "organization",
  "customer",
  "user",
]);

const uploads = pgTable(
  "upload",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    visibility: uploadVisibilityEnum("visibility").notNull(),
    mimeType: text("mime_type").notNull(),
    ...generateTimestamps(),
  },
  (table) => [index("upload_visibility_idx").on(table.visibility)],
);

const uploadReferences = pgTable(
  "upload_reference",
  {
    uploadId: text("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    entityType: uploadEntityTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "upload_reference_pk",
      columns: [table.uploadId, table.entityType, table.entityId],
    }),
    index("upload_reference_upload_id_idx").on(table.uploadId),
    index("upload_reference_entity_idx").on(table.entityType, table.entityId),
    uniqueIndex("upload_reference_single_image_entity_unique")
      .on(table.entityType, table.entityId)
      .where(sql`${table.entityType} NOT IN ('organization', 'customer', 'user')`),
  ],
);

export const uploadsDB = uploads;
export const uploadReferencesDB = uploadReferences;

export type Upload = typeof uploadsDB.$inferSelect;
export type UploadReference = typeof uploadReferencesDB.$inferSelect;
export type UploadEntityType = (typeof uploadEntityTypeEnum.enumValues)[number];
