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
  finance_access: false,
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
  { name: "Finance", permission: "finance_access" },
  { name: "Reports", permission: "reports_access" },
  { name: "Settings", permission: "settings_access" },
];

const FIRST_ACCESSIBLE_PATHS: Array<{ permission: ResponsibilityAccessKey; path: string }> = [
  { permission: "dashboard_access", path: "/workspace" },
  { permission: "purchase_access", path: "/workspace/purchase/supplier" },
  { permission: "inventory_access", path: "/workspace/inventory/products" },
  { permission: "sales_access", path: "/workspace/sales/customer" },
  { permission: "sales_billing_access", path: "/workspace/transactions/sales" },
  { permission: "finance_access", path: "/workspace/finance" },
  { permission: "ecommerce_access", path: "/workspace/ecom-config/settings" },
  { permission: "reports_access", path: "/workspace/reports/stock-ledger-report" },
  { permission: "settings_access", path: "/workspace/administration/masters" },
];

const ROUTE_RULES: ProtectedRouteRule[] = [
  {
    prefixes: [
      "/workspace/finance",
    ],
    permission: "finance_access",
  },
  {
    prefixes: [
      "/workspace/purchase",
      "/workspace/transactions/purchase",
      "/workspace/transactions/purchase-approval",
      "/workspace/transactions/grn",
      "/workspace/transactions/purchase-return",
    ],
    permission: "purchase_access",
  },
  {
    prefixes: [
      "/workspace/inventory/products",
      "/workspace/inventory/opening-stock",
      "/workspace/inventory/stock-adjustment",
      "/workspace/inventory/image-master",
      "/workspace/inventory/image-master-v2",
    ],
    permission: "inventory_access",
  },
  {
    prefixes: [
      "/workspace/sales",
      "/workspace/inventory/pricing",
      "/workspace/inventory/discounts",
    ],
    permission: "sales_access",
  },
  {
    prefixes: [
      "/workspace/transactions/sales",
    ],
    permission: "sales_billing_access",
  },
  {
    prefixes: [
      "/workspace/ecom-config",
      "/workspace/ecom-orders",
      "/workspace/settings/payments",
      "/workspace/settings",
      "/workspace/site-management",
    ],
    permission: "ecommerce_access",
  },
  {
    prefixes: [
      "/workspace/reports",
    ],
    permission: "reports_access",
  },
  {
    prefixes: [
      "/workspace/administration",
      "/workspace/inventory/categories",
      "/workspace/inventory/fittings",
      "/workspace/inventory/colors",
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
  const perms = normalizePermissions(permissionSet);
  if (perms[key]) return true;

  // Administrators (having both settings and dashboard access) inherit full access
  if (perms.settings_access && perms.dashboard_access) {
    return true;
  }

  // Finance team or accounts
  if (key === "finance_access" && perms.finance_access) {
    return true;
  }

  return false;
}

export function getRequiredPermissionForPath(pathname: string): ResponsibilityAccessKey | null {
  if (!pathname) {
    return null;
  }

  const cleanPath = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (cleanPath === "/workspace") {
    return "dashboard_access";
  }

  if (cleanPath === "/workspace/inventory") {
    return "inventory_access";
  }

  let bestMatch: { permission: ResponsibilityAccessKey; prefixLength: number } | null = null;

  for (const rule of ROUTE_RULES) {
    for (const prefix of rule.prefixes) {
      if (cleanPath === prefix || cleanPath.startsWith(`${prefix}/`)) {
        if (!bestMatch || prefix.length > bestMatch.prefixLength) {
          bestMatch = { permission: rule.permission, prefixLength: prefix.length };
        }
      }
    }
  }

  return bestMatch?.permission || null;
}

export function getFirstAccessiblePath(permissionSet: Partial<ResponsibilityPermissions> | null | undefined) {
  const permissions = normalizePermissions(permissionSet);
  const match = FIRST_ACCESSIBLE_PATHS.find((entry) => permissions[entry.permission]);
  return match?.path || null;
}
