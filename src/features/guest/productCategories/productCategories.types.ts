export interface GuestProductCategoryListItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  children: GuestProductCategoryListItem[];
}

export interface GuestProductCategoriesService {
  list(): Promise<GuestProductCategoryListItem[]>;
}
