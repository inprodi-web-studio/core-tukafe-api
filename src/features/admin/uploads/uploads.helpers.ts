import { Storage } from "@google-cloud/storage";
import type { FastifyRequest } from "fastify";
import path from "node:path";
import sharp from "sharp";

import { env } from "@core/config/env.config";
import type { UploadVisibility } from "@core/db/schemas";
import { badRequest, generateNanoId, internalError, normalizeString } from "@core/utils";
import { createMultipartFieldsSchema } from "./create/create.schemas";
import type {
  UploadFileInput,
  UploadOptimizationOptions,
  UploadResizeFit,
} from "./uploads.types";

interface GcsConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  publicBucket: string;
  privateBucket: string;
  uploadsPrefix: string;
}

export interface PreparedUploadFile {
  upload: UploadFileInput;
  outputName: string;
  outputMimeType: string;
  outputBuffer: Buffer;
  optimized: boolean;
}

export interface MultipartCreateUploadsPayload {
  visibility: UploadVisibility;
  files: UploadFileInput[];
  optimization: UploadOptimizationOptions;
}

let cachedStorageClient: Storage | null = null;
let cachedStorageClientKey: string | null = null;

function parseBooleanField(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw badRequest(
    "upload.invalidBoolean",
    "Boolean fields must be one of: true, false, 1, 0, yes, no",
  );
}

function parseNumberField(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw badRequest("upload.invalidNumber", "Numeric fields must contain a valid number");
  }

  return parsed;
}

function normalizeOutputName(filename: string, extension: string): string {
  const parsed = path.parse(filename);
  const normalizedBaseName = normalizeString(parsed.name, {
    trim: true,
    collapseWhitespace: true,
    removeAccents: true,
    lowercase: true,
    removeSpecialChars: true,
    keepChars: ["-", "_"],
    replace: [{ from: /\s+/g, to: "-" }],
    maxLength: 80,
  });
  const baseName = normalizedBaseName.length > 0 ? normalizedBaseName : "file";

  return `${baseName}.${extension}`;
}

function getFileExtensionFromMime(mimeType: string): string {
  if (mimeType === "image/webp") {
    return "webp";
  }

  const [, subtype] = mimeType.split("/");

  if (!subtype) {
    return "bin";
  }

  return subtype.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
}

export function buildUploadObjectKey({
  organizationId,
  fileName,
  uploadsPrefix,
}: {
  organizationId: string;
  fileName: string;
  uploadsPrefix: string;
}): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${uploadsPrefix}/${organizationId}/${year}/${month}/${generateNanoId()}-${fileName}`;
}

export function resolveUploadPath({
  bucket,
  objectKey,
  visibility,
}: {
  bucket: string;
  objectKey: string;
  visibility: UploadVisibility;
}): string {
  if (visibility === "PUBLIC") {
    return `https://storage.googleapis.com/${bucket}/${objectKey}`;
  }

  return `gs://${bucket}/${objectKey}`;
}

export function getBucketByVisibility(config: GcsConfig, visibility: UploadVisibility): string {
  return visibility === "PUBLIC" ? config.publicBucket : config.privateBucket;
}

export function getUploadsGcsConfig(): GcsConfig {
  const projectId = env.GCP_PROJECT_ID;
  const clientEmail = env.GCP_CLIENT_EMAIL;
  const privateKey = env.GCP_PRIVATE_KEY;
  const publicBucket = env.GCS_PUBLIC_BUCKET;
  const privateBucket = env.GCS_PRIVATE_BUCKET;

  if (!projectId) {
    throw internalError(
      "upload.configMissing",
      "GCP_PROJECT_ID is required to use the uploads feature",
    );
  }

  if (!clientEmail || !privateKey) {
    throw internalError(
      "upload.configMissing",
      "GCP_CLIENT_EMAIL and GCP_PRIVATE_KEY are required to use the uploads feature",
    );
  }

  if (!publicBucket || !privateBucket) {
    throw internalError(
      "upload.configMissing",
      "GCS_PUBLIC_BUCKET and GCS_PRIVATE_BUCKET are required to use the uploads feature",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    publicBucket,
    privateBucket,
    uploadsPrefix: env.GCS_UPLOADS_PREFIX,
  };
}

export function getGcsStorageClient(config: GcsConfig): Storage {
  const clientKey = `${config.projectId}:${config.clientEmail}`;

  if (cachedStorageClient && cachedStorageClientKey === clientKey) {
    return cachedStorageClient;
  }

  cachedStorageClient = new Storage({
    projectId: config.projectId,
    credentials: {
      client_email: config.clientEmail,
      private_key: config.privateKey,
    },
  });
  cachedStorageClientKey = clientKey;

  return cachedStorageClient;
}

export async function parseCreateUploadsMultipartRequest(
  request: FastifyRequest,
): Promise<MultipartCreateUploadsPayload> {
  const files: UploadFileInput[] = [];
  const fields: Record<string, string | undefined> = {};

  const parts = request.parts();

  for await (const part of parts) {
    if (part.type === "file") {
      const filename = part.filename ?? part.fieldname ?? "file";
      const mimeType = part.mimetype ?? "application/octet-stream";
      const buffer = await part.toBuffer();

      if (buffer.length === 0) {
        throw badRequest("upload.emptyFile", `The file "${filename}" is empty`);
      }

      files.push({
        filename,
        mimeType,
        buffer,
        sizeBytes: buffer.length,
      });

      continue;
    }

    fields[part.fieldname] = String(part.value ?? "");
  }

  if (files.length === 0) {
    throw badRequest(
      "upload.filesRequired",
      "At least one file must be provided in multipart/form-data",
    );
  }

  const parsedFields = createMultipartFieldsSchema.parse({
    visibility: fields.visibility,
    optimizeImage: parseBooleanField(fields.optimizeImage),
    optimizationQuality: parseNumberField(fields.optimizationQuality),
    maxWidth: parseNumberField(fields.maxWidth),
    maxHeight: parseNumberField(fields.maxHeight),
    fit: fields.fit as UploadResizeFit | undefined,
  });

  return {
    visibility: parsedFields.visibility,
    files,
    optimization: {
      enabled: parsedFields.optimizeImage,
      quality: parsedFields.optimizationQuality,
      maxWidth: parsedFields.maxWidth ?? null,
      maxHeight: parsedFields.maxHeight ?? null,
      fit: parsedFields.fit,
    },
  };
}

export async function prepareUploadFile({
  file,
  optimization,
}: {
  file: UploadFileInput;
  optimization: UploadOptimizationOptions;
}): Promise<PreparedUploadFile> {
  const isImage = file.mimeType.toLowerCase().startsWith("image/");

  if (!optimization.enabled || !isImage) {
    const extension = path.extname(file.filename).replace(".", "") || getFileExtensionFromMime(file.mimeType);

    return {
      upload: file,
      outputName: normalizeOutputName(file.filename, extension),
      outputMimeType: file.mimeType,
      outputBuffer: file.buffer,
      optimized: false,
    };
  }

  const sharpPipeline = sharp(file.buffer, {
    failOn: "none",
    animated: true,
    limitInputPixels: false,
  }).rotate();

  if (optimization.maxWidth || optimization.maxHeight) {
    sharpPipeline.resize({
      width: optimization.maxWidth ?? undefined,
      height: optimization.maxHeight ?? undefined,
      fit: optimization.fit,
      withoutEnlargement: true,
    });
  }

  const optimizedBuffer = await sharpPipeline
    .webp({
      quality: optimization.quality,
      effort: 4,
    })
    .toBuffer();

  return {
    upload: file,
    outputName: normalizeOutputName(file.filename, "webp"),
    outputMimeType: "image/webp",
    outputBuffer: optimizedBuffer,
    optimized: true,
  };
}

export function buildUploadRows(params: {
  organizationId: string;
  visibility: UploadVisibility;
  config: GcsConfig;
  preparedFiles: PreparedUploadFile[];
}) {
  const bucket = getBucketByVisibility(params.config, params.visibility);

  return params.preparedFiles.map((preparedFile) => {
    const objectKey = buildUploadObjectKey({
      organizationId: params.organizationId,
      fileName: preparedFile.outputName,
      uploadsPrefix: params.config.uploadsPrefix,
    });

    return {
      objectKey,
      bucket,
      path: resolveUploadPath({
        bucket,
        objectKey,
        visibility: params.visibility,
      }),
      name: preparedFile.outputName,
      mimeType: preparedFile.outputMimeType,
      fileBuffer: preparedFile.outputBuffer,
      originalName: preparedFile.upload.filename,
      originalMimeType: preparedFile.upload.mimeType,
      originalSizeBytes: preparedFile.upload.sizeBytes,
      storedSizeBytes: preparedFile.outputBuffer.length,
      optimized: preparedFile.optimized,
    };
  });
}
