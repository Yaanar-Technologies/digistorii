export type SalesDetail = {
  id?: number;
  product_id: string;
  product_code?: string;
  product_name?: string;
  description: string;
  barcode?: string;
  sku?: string;
  hsn_no: string;
  uom: string;
  uom_code: string;
  uom_name: string;
  rate: number | "";
  qty: number | "";
  amount?: number;
  discount: number | "";
  discount_type?: "percentage" | "fixed" | "percent" | "amount";
  discount_value?: number | "";
  discount_name?: string;
  discount_auto?: boolean;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
  tax_id?: number | null;
  tax_name?: string;
};

export type SalesHeader = {
  id?: number;
  sales_no: string;
  customer_id: string;
  warehouse_id?: string | number | null;
  warehouse_name?: string | null;
  location_id?: string | number | null;
  location_name?: string | null;
  locator_id?: string | number | null;
  branch_name?: string | null;
  invoice_date: string;
  sales_date: string;
  status: string;
  payment_status: "paid" | "unpaid" | "partial" | "";
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  user_name?: string;
  currency: string;
};

export type SalesPayment = {
  id?: number;
  payment_mode_id: number;
  payment_mode_name?: string;
  amount: number | "";
  location_id?: number | null;
  warehouse_id?: number | null;
};

export type ProductRow = {
  product_id: string;
  product_code?: string;
  product_name?: string;
  description: string;
  uom: string;
  uom_code: string;
  uom_name: string;
  hsn_no: string;
  rate: number | "";
  qty: number | "";
  amount: number;
  discount: number | "";
  discount_type?: "percentage" | "fixed" | "percent" | "amount";
  discount_value?: number | "";
  discount_name?: string;
  discount_auto?: boolean;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
  tax_id?: number | null;
  tax_name?: string;
};

export type Product = {
  id: number;
  product_id: number | undefined;
  variant_id: number | null;
  product_code: string;
  product_name: string;
  description: string;
  sku?: string;
  barcode?: string;
  base_price?: number;
  selling_price?: number;
  tax_rate?: number;
  uom: string;
  hsn_code: string;
  uom_code?: string;
  uom_name?: string;
  category?: string | null;
  color?: string | null;
  type?: "finished_good" | "raw_material" | "other" | null;
  source?: "own" | "vendor" | null;
};

export type Warehouse = {
  id: number;
  code?: string | null;
  name?: string | null;
  location_id?: number | null;
  location_name?: string | null;
};

export type PaymentMode = {
  id: number;
  payment_mode_name: string;
  is_default?: boolean;
  is_active?: boolean;
};

export type Locator = {
  id: number;
  locator_name?: string | null;
  name?: string | null;
  warehouse_id?: number | null;
};

export type Customer = {
  id: number;
  customer_code: string;
  cust_code?: string;
  name: string;
  cust_name?: string;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_line3?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
};

export type SalesIndexRow = {
  id: number;
  sales_no: string;
  customer_id: number;
  customer_name?: string;
  sales_date?: string;
  created_at?: string;
  total_amount?: number;
  items_count?: number;
  status?: string;
  payment_status?: string;
};

export type ActiveTodayDiscount = {
  variant_id: number;
  discount_type: "percentage" | "fixed";
  value: number;
  priority: number;
};

export type PurchaseHistoryRow = {
  id: number;
  sales_no: string;
  dateLabel: string;
  items_count: number;
  amount: number;
};

export type MonthlySpendRow = {
  month: string;
  total: number;
};
