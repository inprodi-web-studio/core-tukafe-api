import { uploadsDB } from "@core/db/schemas";
import { generateNanoId } from "@core/utils";
import type { FastifyInstance } from "fastify";

import {
  buildUploadRows,
  getGcsStorageClient,
  getUploadsGcsConfig,
  prepareUploadFile,
} from "./uploads.helpers";
import type { AdminUploadsService } from "./uploads.types";

interface UploadedObjectRef {
  bucket: string;
  objectKey: string;
}

export function adminUploadsService(fastify: FastifyInstance): AdminUploadsService {
  return {
    async create(input) {
      const config = getUploadsGcsConfig();
      const storageClient = getGcsStorageClient(config);

      const preparedFiles = await Promise.all(
        input.files.map((file) =>
          prepareUploadFile({
            file,
            optimization: input.optimization,
          }),
        ),
      );

      const uploadRows = buildUploadRows({
        organizationId: input.organizationId,
        visibility: input.visibility,
        config,
        preparedFiles,
      });

      const uploadedObjects: UploadedObjectRef[] = [];

      try {
        for (const uploadRow of uploadRows) {
          const bucket = storageClient.bucket(uploadRow.bucket);
          const gcsFile = bucket.file(uploadRow.objectKey);

          await gcsFile.save(uploadRow.fileBuffer, {
            contentType: uploadRow.mimeType,
            resumable: uploadRow.fileBuffer.length > 10 * 1024 * 1024,
            metadata: {
              cacheControl:
                input.visibility === "PUBLIC"
                  ? "public, max-age=31536000, immutable"
                  : "private, max-age=0, no-cache",
            },
          });

          uploadedObjects.push({
            bucket: uploadRow.bucket,
            objectKey: uploadRow.objectKey,
          });
        }

        const createdUploads = await fastify.db.transaction(async (tx) => {
          return tx
            .insert(uploadsDB)
            .values(
              uploadRows.map((uploadRow) => ({
                id: generateNanoId(),
                name: uploadRow.name,
                path: uploadRow.path,
                visibility: input.visibility,
                mimeType: uploadRow.mimeType,
              })),
            )
            .returning();
        });

        return createdUploads.map((createdUpload, index) => {
          const source = uploadRows[index];

          if (!source) {
            throw new Error("Upload metadata mismatch");
          }

          return {
            id: createdUpload.id,
            name: createdUpload.name,
            path: createdUpload.path,
            visibility: createdUpload.visibility,
            mimeType: createdUpload.mimeType,
            optimized: source.optimized,
            originalName: source.originalName,
            originalMimeType: source.originalMimeType,
            originalSizeBytes: source.originalSizeBytes,
            storedSizeBytes: source.storedSizeBytes,
          };
        });
      } catch (error) {
        await Promise.allSettled(
          uploadedObjects.map(async ({ bucket, objectKey }) => {
            await storageClient.bucket(bucket).file(objectKey).delete({
              ignoreNotFound: true,
            });
          }),
        );

        throw error;
      }
    },
  };
}
