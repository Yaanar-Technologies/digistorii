"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSidebar } from "../context/SidebarContext";
import { useParams, usePathname } from "next/navigation";
import { useUser } from "@/context/CurrentUserContext";
import {
  BoxCubeIcon,
  CalenderIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  FileIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  UserCircleIcon,
  PaperPlaneIcon, IconSettings, Cash
} from "../icons/index";

import {
  Squares2X2Icon,
  ArrowsRightLeftIcon,
  Cog6ToothIcon,
  BanknotesIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { canAccess } from "@/lib/accessControl";
import { ResponsibilityAccessKey } from "@/lib/userResponsibilities";


type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  permission?: ResponsibilityAccessKey;
  ecommerce_access?: boolean;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    permission: "dashboard_access",
    // subItems: [{ name: "Ecommerce", path: "/", pro: false }],
    path: "/workspace", // go straight to dashboard
  },

  {
    name: "Purchase",
    icon: <FileIcon />,
    permission: "purchase_access",
    subItems: [
      { name: "Supplier", path: "/workspace/purchase/supplier", pro: false },
      { name: "Purchase Order", path: "/workspace/transactions/purchase", pro: false },
      { name: "Purchase Order Approval", path: "/workspace/transactions/purchase-approval", pro: false },
      { name: "GRN", path: "/workspace/transactions/grn", pro: false },
      { name: "Purchase Return", path: "/workspace/transactions/purchase-return", pro: false },
    ],
  },
  {
    name: "Inventory",
    icon: <BoxCubeIcon />,
    permission: "inventory_access",
    subItems: [
      { name: "Products", path: "/workspace/inventory/products", pro: false },
      // { name: "Image Master", path: "/workspace/inventory/image-master", pro: false },
      { name: "Image Master", path: "/workspace/inventory/image-master-v2", pro: false },
      // { name: "Add Product", path: "/workspace/inventory/product/add-products", pro: false },
      { name: "Opening Stock", path: "/workspace/inventory/opening-stock", pro: false },
      { name: "Stock Adjustment", path: "/workspace/inventory/stock-adjustment", pro: false },
    ],
  },
  {
    name: "Sales",
    icon: <PaperPlaneIcon />,
    permission: "sales_access",
    subItems: [
      { name: "Customer", path: "/workspace/sales/customer", pro: false },
      { name: "Pricing", path: "/workspace/inventory/pricing", pro: false },
      { name: "Discount Schemes", path: "/workspace/inventory/discounts", pro: false },
    ],
  }, {
    name: "Sales Billing",
    icon: <Cash />,
    permission: "sales_billing_access",
    // subItems: [
    //    {name: "Sales Billing" ,path:"/workspace/transactions/sales",pro:false}
    // ],
    path: "/workspace/transactions/sales",
  },
  {
    name: "E-Commerce",
    icon: <ShoppingCartIcon className="w-5 h-5" />,
    ecommerce_access: true,
    subItems: [
      { name: "Online Orders", path: "/workspace/ecom-orders", pro: false },
      { name: "Store Settings", path: "/workspace/ecom-config/settings", pro: false },
      { name: "Product Catalog", path: "/workspace/ecom-config/products", pro: false },
      { name: "Theme & Customize", path: "/workspace/ecom-config/theme", pro: false },
    ],
  },
  {
    name: "Reports",
    icon: <TableIcon />,
    permission: "reports_access",
    subItems: [
      { name: "Stock Ledger", path: "/workspace/reports/stock-ledger-report", pro: false },
      { name: "PO Summary Report", path: "/workspace/reports/po-summary-report", pro: false },
      { name: "PO Items Report", path: "/workspace/reports/po-items-report", pro: false },
    ],
  },
  {
    name: "Administration",
    icon: <IconSettings />,
    permission: "settings_access",
    path: "/workspace/administration/masters",
  }
  // {
  //   name: "Transactions",
  //   icon: <ArrowsRightLeftIcon className="w-5 h-5" />,
  //   subItems: [
  //     { name: "Purchase", path: "/workspace/transactions/purchase", pro: false },
  //   ],
  // },

];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const { user } = useUser();

  // Replace the pathname.split logic with useParams
  const params = useParams();
  const company = params.company as string || "";

  const [openSubmenu, setOpenSubmenu] = useState<{
    // type: "main" | "others";
    type: "main" | "others";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = useCallback((path: string) => path === pathname, [pathname]);
  const isActive = useCallback((path: string) => {
    const fullPath = `/${company}${path}`;
    // Check if the current pathname is exactly the full path 
    // or if it's the root dashboard
    return pathname === fullPath || (path === "/" && pathname === `/${company}`);
  }, [pathname, company]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  // useEffect(() => {
  //   // Open submenu if current path matches any subItem
  //   let submenuMatched = false;
  //   ["main", "others"].forEach((menuType) => {
  //     const items = menuType === "main" ? navItems : othersItems;
  //     items.forEach((nav, index) => {
  //       if (nav.subItems) {
  //         nav.subItems.forEach((subItem) => {
  //           if (isActive(subItem.path)) {
  //             setOpenSubmenu({ type: menuType as "main" | "others", index });
  //             submenuMatched = true;
  //           }
  //         });
  //       }
  //     });
  //   });

  //   if (!submenuMatched) {
  //     setOpenSubmenu(null);
  //   }
  // }, [pathname, isActive]);

  useEffect(() => {
    // Set submenu heights when open
    if (openSubmenu) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      const el = subMenuRefs.current[key];
      if (el) {
        setSubMenuHeight((prev) => ({ ...prev, [key]: el.scrollHeight || 0 }));
      }
    }
  }, [openSubmenu]);

  const allowedNavItems = navItems.filter((item) => {
    if (item.permission && !canAccess(user?.permissions, item.permission)) {
      return false;
    }
    if (item.ecommerce_access) {
      if (!user?.ecommerce_access || !canAccess(user?.permissions, "ecommerce_access")) {
        return false;
      }
    }
    return true;
  });

  const renderMenuItems = (navItems: NavItem[], menuType: "main" | "others") => (
    <ul className="flex flex-col gap-4">
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <>
              <button
                onClick={() => handleSubmenuToggle(index, menuType)}
                className={`menu-item group ${openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
                  } cursor-pointer ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"
                  }`}
              >
                <span
                  className={`${openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                    }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
                {(isExpanded || isHovered || isMobileOpen) && (
                  <ChevronDownIcon
                    className={`ml-auto w-5 h-5 transition-transform duration-200 ${openSubmenu?.type === menuType &&
                      openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                      }`}
                  />
                )}
              </button>

              {/* Submenu */}
              <div
                ref={(el) => {
                  subMenuRefs.current[`${menuType}-${index}`] = el || null;
                }}
                className="overflow-hidden transition-all duration-300"
                style={{
                  height:
                    openSubmenu?.type === menuType && openSubmenu?.index === index
                      ? `${subMenuHeight[`${menuType}-${index}`]}px`
                      : "0px",
                }}
              >
                <ul className="mt-2 space-y-1 ml-9">
                  {nav.subItems.map((subItem) => (
                    <li key={subItem.name}>
                      <Link
                        href={`/${company}${subItem.path}`}
                        className={`menu-dropdown-item ${isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                          }`}
                      >
                        {subItem.name}
                        <span className="flex items-center gap-1 ml-auto">
                          {subItem.new && (
                            <span
                              className={`ml-auto ${isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                                } menu-dropdown-badge`}
                            >
                              new
                            </span>
                          )}
                          {subItem.pro && (
                            <span
                              className={`ml-auto ${isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                                } menu-dropdown-badge`}
                            >
                              pro
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            nav.path && (
              <Link
                href={`/${company}${nav.path}`}
                className={`menu-item group ${isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                  }`}
              >
                <span
                  className={`${isActive(nav.path)
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                    }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${isExpanded || isMobileOpen
          ? "w-[290px]"
          : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href={`/${company || ""}/dashboard`}>
          {isExpanded || isHovered || isMobileOpen ? (
            <div className="bg-blue-600 rounded-lg w-36 h-10 flex items-center justify-center text-white font-bold text-lg">
              {company.charAt(0).toUpperCase() + company.slice(1)}
            </div>
          ) : (
            <div className="bg-blue-600 rounded-full w-10 h-10 flex items-center justify-center text-white font-bold text-lg">
              {company.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>
      </div> */}
      <div
        className="py-8 flex items-center gap-3">
        <Link href={`/${company || ""}/workspace`} className="flex items-center gap-3">
          {/* Icon */}
          <div className="bg-blue-600 rounded-full w-10 h-10 flex items-center justify-center text-white font-bold text-lg">
            {(user?.real_company_name || user?.company_name || company)
              .charAt(0)
              .toUpperCase()}
          </div>

          {/* Company Name */}
          {(isExpanded || isHovered || isMobileOpen) && (
            <span className="text-lg font-semibold text-gray-800 dark:text-white">
              {user?.real_company_name || user?.company_name || (company.charAt(0).toUpperCase() + company.slice(1))}
            </span>
          )}
        </Link>
      </div>

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>{renderMenuItems(allowedNavItems, "main")}</div>

            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "justify-start"
                  }`}
              >

              </h2>

            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
