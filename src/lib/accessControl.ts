import { ResponsibilityAccessKey } from "./userResponsibilities";

export type ResponsibilityPermissions = Record<ResponsibilityAccessKey, boolean>;

export const DEFAULT_PERMISSIONS: ResponsibilityPermissions = {
  dashboard_access: false,
  purchase_access: false,
  inventory_access: false,
  sales_access: false,
  sales_billing_access: false,
  reports_access: false,
  settings_access: false,
  ecommerce_access: false,
};

type ProtectedRouteRule = {
  prefixes: string[];
  permission: ResponsibilityAccessKey;
};

export const MENU_PERMISSION_MAP: Array<{ name: string; permission: ResponsibilityAccessKey }> = [
  { name: "Dashboard", permission: "dashboard_access" },
  { name: "Purchase", permission: "purchase_access" },
  { name: "Inventory", permission: "inventory_access" },
  { name: "Sales", permission: "sales_access" },
  { name: "Sales Billing", permission: "sales_billing_access" },
  { name: "E-Commerce", permission: "ecommerce_access" },
  { name: "Reports", permission: "reports_access" },
  { name: "Settings", permission: "settings_access" },
];

const FIRST_ACCESSIBLE_PATHS: Array<{ permission: ResponsibilityAccessKey; path: string }> = [
  { permission: "dashboard_access", path: "/workspace" },
  { permission: "purchase_access", path: "/workspace/purchase/supplier" },
  { permission: "inventory_access", path: "/workspace/inventory/products" },
  { permission: "sales_access", path: "/workspace/sales/customer" },
  { permission: "sales_billing_access", path: "/workspace/transactions/sales" },
  { permission: "ecommerce_access", path: "/workspace/ecom-config/settings" },
  { permission: "reports_access", path: "/workspace/reports/stock-ledger-report" },
  { permission: "settings_access", path: "/workspace/administration/user-responsibilities" },
];

const ROUTE_RULES: ProtectedRouteRule[] = [
  {
    prefixes: ["/workspace/purchase", "/workspace/transactions/purchase", "/workspace/transactions/purchase-approval", "/workspace/transactions/grn", "/workspace/transactions/purchase-return"],
    permission: "purchase_access",
  },
  {
    prefixes: ["/workspace/inventory/products", "/workspace/inventory/opening-stock", "/workspace/inventory/image-master", "/workspace/inventory/image-master-v2"],
    permission: "inventory_access",
  },
  {
    prefixes: ["/workspace/sales", "/workspace/inventory/pricing", "/workspace/inventory/discounts"],
    permission: "sales_access",
  },
  {
    prefixes: ["/workspace/transactions/sales"],
    permission: "sales_billing_access",
  },
  {
    prefixes: ["/workspace/ecom-config"],
    permission: "ecommerce_access",
  },
  {
    prefixes: ["/workspace/reports"],
    permission: "reports_access",
  },
  {
    prefixes: [
      "/workspace/inventory/categories",
      "/workspace/inventory/materials",
      "/workspace/inventory/uom",
      "/workspace/inventory/tax",
      "/workspace/inventory/payment-mode",
      "/workspace/inventory/payment-terms",
      "/workspace/inventory/currency-rate",
      "/workspace/inventory/currencies",
      "/workspace/inventory/location",
      "/workspace/inventory/warehouse",
      "/workspace/inventory/locator",
      "/workspace/inventory/despatch-terms",
      "/workspace/inventory/company-settings",
      "/workspace/inventory/user-settings",
      "/workspace/administration/user-responsibilities",
      "/admin",
    ],
    permission: "settings_access",
  },
];

export function normalizePermissions(input?: Partial<ResponsibilityPermissions> | null) {
  return {
    ...DEFAULT_PERMISSIONS,
    ...(input || {}),
  };
}

export function canAccess(permissionSet: Partial<ResponsibilityPermissions> | null | undefined, key: ResponsibilityAccessKey) {
  return Boolean(normalizePermissions(permissionSet)[key]);
}

export function getRequiredPermissionForPath(pathname: string): ResponsibilityAccessKey | null {
  if (!pathname || pathname === "/workspace" || pathname === "/workspace/") {
    return "dashboard_access";
  }

  for (const rule of ROUTE_RULES) {
    if (rule.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return rule.permission;
    }
  }

  return null;
}

export function getFirstAccessiblePath(permissionSet: Partial<ResponsibilityPermissions> | null | undefined) {
  const permissions = normalizePermissions(permissionSet);
  const match = FIRST_ACCESSIBLE_PATHS.find((entry) => permissions[entry.permission]);
  return match?.path || null;
}
