"use client";

import type {
  Customer,
  PaymentMode,
  Product,
  SalesPayment,
  Warehouse,
} from "@/types/sales";
import type { CustomerSelectOption } from "@/components/sales/SalesHeader";

export const generateSalesNo = () => {
  const datePart = new Date().toISOString().split("T")[0].replaceAll("-", "");
  const randomPart = Math.floor(Math.random() * 9000 + 1000);
  return `SAL-${datePart}-${randomPart}`;
};

export const roundMoney = (value: unknown) => Number(Number(value || 0).toFixed(2));

export const parseUserSessionCookie = () => {
  if (typeof document === "undefined") {
    return {
      warehouse_id: null as number | null,
      location_id: null as number | null,
      warehouse_name: "",
      location_name: "",
    };
  }

  const cookieEntry = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("user="));
  if (!cookieEntry) {
    return {
      warehouse_id: null as number | null,
      location_id: null as number | null,
      warehouse_name: "",
      location_name: "",
    };
  }

  try {
    const rawValue = decodeURIComponent(cookieEntry.slice("user=".length));
    const parsed = JSON.parse(rawValue);
    const warehouseId = Number(parsed?.warehouse_id);
    const locationId = Number(parsed?.location_id);
    return {
      warehouse_id: Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null,
      location_id: Number.isInteger(locationId) && locationId > 0 ? locationId : null,
      warehouse_name: String(parsed?.warehouse_name || "").trim(),
      location_name: String(parsed?.location_name || "").trim(),
    };
  } catch {
    return {
      warehouse_id: null as number | null,
      location_id: null as number | null,
      warehouse_name: "",
      location_name: "",
    };
  }
};

export const calculatePaymentStatus = (totalAmount: number, paidAmount: number) => {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= totalAmount) return "paid";
  return "partial";
};

export const normalizeCustomer = (raw: any): Customer | null => {
  if (!raw || typeof raw !== "object") return null;
  const numericId = Number(raw.id ?? raw.customer_id ?? raw.customerId);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  const customerName = String(
    raw.cust_name ?? raw.name ?? raw.customer_name ?? raw.customerName ?? ""
  ).trim();
  const customerPhone = String(
    raw.phone ?? raw.phoneNumber ?? raw.contact_phone1 ?? raw.mobile_no ?? ""
  ).trim();
  const customerCode = String(raw.customer_code ?? raw.cust_code ?? "").trim();

  return {
    ...raw,
    id: numericId,
    customer_code: customerCode,
    cust_code: customerCode || String(raw.cust_code || "").trim(),
    name: customerName,
    cust_name: customerName,
    phone: customerPhone || null,
  } as Customer;
};

export const mapCustomerToSelectOption = (customer: Customer): CustomerSelectOption => {
  const phoneNumber = String(customer.phone || "").trim();
  const customerName = String(customer.cust_name || customer.name || "").trim();
  return {
    value: String(customer.id),
    label: `${phoneNumber} - ${customerName}`,
    phoneNumber,
    customerName,
    customer,
  };
};

export const getCustomerDisplayName = (customer?: Customer | null) => {
  if (!customer) return "";
  return String(customer.cust_name || customer.name || "");
};

export const getCustomerAddress = (customer?: Customer | null) => {
  if (!customer) return "";
  const parts = [
    customer.address_line1,
    customer.address_line2,
    customer.address_line3,
    customer.city,
    customer.state,
    customer.pincode,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return parts.join(", ");
};

export const buildCustomerOptions = (customers: Customer[]) =>
  customers.map(mapCustomerToSelectOption);

export const filterCustomerOptions = (
  customerOptions: CustomerSelectOption[],
  customerLookupInput: string
) => {
  const search = String(customerLookupInput || "").trim().toLowerCase();
  if (!search) return customerOptions;
  return customerOptions.filter((option) => {
    const phone = String(option.phoneNumber || "").toLowerCase();
    const name = String(option.customerName || "").toLowerCase();
    return phone.includes(search) || name.includes(search);
  });
};

export const buildProductMaps = (products: Product[]) => {
  const productById = new Map<number, Product>();
  const productByBarcode = new Map<string, Product>();

  products.forEach((product) => {
    if (Number.isFinite(product.id)) {
      productById.set(Number(product.id), product);
    }
    const barcode = String(product.barcode || "").trim();
    if (barcode) {
      productByBarcode.set(barcode, product);
    }
  });

  return { productById, productByBarcode };
};

export const createPaymentEntry = (
  mode: PaymentMode,
  payments: SalesPayment[],
  totalAmount: number,
  warehouse: Warehouse | null
): SalesPayment => {
  const total = roundMoney(Number(totalAmount || 0));
  const usedAmount = roundMoney(
    payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  );
  const remainingAmount = roundMoney(Math.max(total - usedAmount, 0));

  return {
    payment_mode_id: mode.id,
    payment_mode_name: mode.payment_mode_name,
    amount: payments.length === 0 ? total : remainingAmount,
    location_id: warehouse?.location_id ?? null,
    warehouse_id: warehouse?.id ?? null,
  };
};
