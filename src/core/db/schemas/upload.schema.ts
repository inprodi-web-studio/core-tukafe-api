import { index, integer, pgEnum, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";

export const uploadVisibilityEnum = pgEnum("upload_visibility", ["PUBLIC", "PRIVATE"]);
export const uploadEntityTypeEnum = pgEnum("upload_entity_type", [
  "product",
  "organization",
  "customer",
  "user",
]);

const uploads = pgTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    visibility: uploadVisibilityEnum("visibility").notNull(),
    mimeType: text("mime_type").notNull(),
    ...generateTimestamps(),
  },
  (table) => [index("uploads_visibility_idx").on(table.visibility)],
);

const uploadReferences = pgTable(
  "upload_references",
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
      name: "upload_references_pk",
      columns: [table.uploadId, table.entityType, table.entityId],
    }),
    index("upload_references_upload_id_idx").on(table.uploadId),
    index("upload_references_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const uploadsDB = uploads;
export const uploadReferencesDB = uploadReferences;

export type Upload = typeof uploadsDB.$inferSelect;
export type UploadReference = typeof uploadReferencesDB.$inferSelect;
export type UploadEntityType = (typeof uploadEntityTypeEnum.enumValues)[number];
