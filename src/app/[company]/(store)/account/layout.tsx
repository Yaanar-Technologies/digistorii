"use client";

import React, { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  UserIcon,
  ShoppingBagIcon,
  MapPinIcon,
  QuestionMarkCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
  BuildingStorefrontIcon,
} from "@heroicons/react/24/outline";
import { StorefrontHeader, StorefrontFooter, mockFooterSettings, useStorefrontTheme, CustomerAuthModal } from "@/components/storefront";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { useCartStore } from "@/store/cartStore";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const company = (params.company as string) || "";
  const theme = useStorefrontTheme();
  const [footerSettings] = useState(mockFooterSettings);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const { customer, isAuthenticated, isLoading, checkSession, logout } = useCustomerAuthStore();
  const cartItems = useCartStore((state) => state.items);

  useEffect(() => {
    if (company) {
      checkSession(company);
    }
  }, [company, checkSession]);

  const navItems = [
    {
      name: "Overview",
      href: `/${company}/account`,
      exact: true,
      icon: UserIcon,
    },
    {
      name: "My Orders",
      href: `/${company}/account/orders`,
      exact: false,
      icon: ShoppingBagIcon,
    },
    {
      name: "Saved Addresses",
      href: `/${company}/account/addresses`,
      exact: false,
      icon: MapPinIcon,
    },
    {
      name: "Help & Support",
      href: `/${company}/account/support`,
      exact: false,
      icon: QuestionMarkCircleIcon,
    },
    {
      name: "Privacy & Settings",
      href: `/${company}/account/settings`,
      exact: false,
      icon: Cog6ToothIcon,
    },
  ];

  const handleLogout = async () => {
    await logout(company);
    router.push(`/${company}/store`);
  };

  const getInitials = (name?: string) => {
    if (!name) return "CU";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div
      className="min-h-screen bg-slate-50 flex flex-col justify-between"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div>
        <StorefrontHeader
          theme={theme}
          company={company}
          cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
          onOpenCart={() => router.push(`/${company}/store/cart`)}
          onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
          onOpenAuth={() => setIsAuthOpen(true)}
        />

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {!isLoading && !isAuthenticated ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-12 text-center max-w-md mx-auto my-12 space-y-4 shadow-sm">
              <div className="h-14 w-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <ShieldCheckIcon className="h-8 w-8" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Sign in to Access Account</h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                Please sign in to view your order history, manage saved delivery addresses, track packages, or update preferences.
              </p>
              <button
                onClick={() => setIsAuthOpen(true)}
                className="w-full rounded-xl py-2.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: theme.primaryColor || "#4f46e5" }}
              >
                Sign In / Register
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
              {/* SIDEBAR NAVIGATION */}
              <aside className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-4">
                {/* Profile Summary Badge */}
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                    {getInitials(customer?.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-slate-900 truncate">
                      {customer?.name || "Customer"}
                    </h2>
                    <p className="text-xs text-slate-500 truncate font-mono">
                      {customer?.phone || customer?.email || "Member"}
                    </p>
                  </div>
                </div>

                {/* Nav Links */}
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                          isActive
                            ? "bg-indigo-50 text-indigo-700 shadow-2xs font-bold"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </nav>

                {/* Return to Store & Logout */}
                <div className="pt-3 border-t border-slate-100 space-y-1">
                  <Link
                    href={`/${company}/store`}
                    className="flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <BuildingStorefrontIcon className="h-4 w-4 text-slate-400" />
                    <span>Back to Storefront</span>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                  >
                    <ArrowRightOnRectangleIcon className="h-4 w-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </aside>

              {/* MAIN CONTENT AREA */}
              <div className="lg:col-span-3 min-w-0">
                {children}
              </div>
            </div>
          )}
        </main>
      </div>

      <StorefrontFooter theme={theme} settings={footerSettings} />

      <CustomerAuthModal
        theme={theme}
        company={company}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccessAuth={() => {
          checkSession(company);
          setIsAuthOpen(false);
        }}
      />
    </div>
  );
}

