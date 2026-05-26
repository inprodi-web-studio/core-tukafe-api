import type { UploadVisibility } from "@core/db/schemas";
import type { Buffer } from "node:buffer";

export type UploadResizeFit = "cover" | "contain" | "fill" | "inside" | "outside";

export interface UploadFileInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
}

export interface UploadOptimizationOptions {
  enabled: boolean;
  quality: number;
  maxWidth: number | null;
  maxHeight: number | null;
  fit: UploadResizeFit;
}

export interface CreateUploadsServiceParams {
  organizationId: string;
  visibility: UploadVisibility;
  files: UploadFileInput[];
  optimization: UploadOptimizationOptions;
}

export interface CreatedUploadItem {
  id: string;
  name: string;
  path: string;
  visibility: UploadVisibility;
  mimeType: string;
  optimized: boolean;
  originalName: string;
  originalMimeType: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
}

export interface AdminUploadsService {
  create(input: CreateUploadsServiceParams): Promise<CreatedUploadItem[]>;
}
