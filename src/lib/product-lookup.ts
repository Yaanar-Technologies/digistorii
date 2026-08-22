export const PRODUCT_LOOKUP_COLUMNS = [
  "code",
  "sku",
  "color",
  "name",
  "description",
  "category",
  "current_stock"
] as const;

export const PRODUCT_LOOKUP_COLUMN_LABELS: Record<(typeof PRODUCT_LOOKUP_COLUMNS)[number], string> = {
  code: "Product Code",
  sku: "SKU",
  color: "Color",
  name: "Name",
  description: "Description",
  category: "Category",
  current_stock: "On Hand"
};

export type ProductLookupItem = {
  id: number;
  variant_id: number;
  product_id: number;
  code: string;
  product_code: string;
  sku: string;
  color: string | null;
  name: string;
  description: string | null;
  category_name: string | null;
  category: string | null;
  current_stock?: number | null;
  selling_price?: number | null;
  type?: "finished_good" | "raw_material" | "other" | null;
  source?: "own" | "vendor" | null;
  uom?: string | null;
  uom_code?: string | null;
  uom_name?: string | null;
  hsn_code?: string | null;
  barcode?: string | null;
  last_price_this_supplier?: number | null;
  lowest_price_overall?: number | null;
  lowest_price_supplier_name?: string | null;
  lowest_price_date?: string | null;
};
