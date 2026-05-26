import type { Upload } from "@core/db/schemas";

export type GuestProductCategoryImage = Pick<
  Upload,
  "id" | "name" | "path" | "visibility" | "mimeType"
>;

export interface GuestProductCategoryListItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  isFourPlusOneEligible: boolean;
  image: GuestProductCategoryImage | null;
  children: GuestProductCategoryListItem[];
}

export interface GuestProductCategoriesService {
  list(): Promise<GuestProductCategoryListItem[]>;
}
