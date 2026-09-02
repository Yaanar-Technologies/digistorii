"use client";

import React, { useState, useEffect } from "react";
import { StorefrontTheme, CategoryType } from "./types";
import { useCartStore } from "@/store/cartStore";
import { useWishlistStore } from "@/store/wishlistStore";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { useRouter } from "next/navigation";

export interface StorefrontHeaderProps {
  theme: StorefrontTheme;
  company?: string;
  categories?: CategoryType[];
  cartCount?: number;
  wishlistCount?: number;
  onOpenCart?: () => void;
  onOpenWishlist?: () => void;
  onOpenAuth?: () => void;
  onSelectCategory?: (categorySlug: string) => void;
  onSearch?: (query: string) => void;
}

export const StorefrontHeader: React.FC<StorefrontHeaderProps> = ({
  theme,
  company: propCompany,
  categories = [],
  cartCount: propCartCount,
  wishlistCount: propWishlistCount,
  onOpenCart,
  onOpenWishlist,
  onOpenAuth,
  onSelectCategory,
  onSearch,
}) => {
  const router = useRouter();
  const storeCartCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const storeWishlistCount = useWishlistStore((state) => state.items.length);

  const cartCount = propCartCount !== undefined ? propCartCount : storeCartCount;
  const wishlistCount = propWishlistCount !== undefined ? propWishlistCount : storeWishlistCount;

  const { customer, isAuthenticated, checkSession, logout } = useCustomerAuthStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const getCompanySlug = () => {
    if (propCompany && propCompany.trim()) return propCompany.trim();
    if (typeof window !== "undefined") {
      const parts = window.location.pathname.split("/").filter(Boolean);
      if (parts.length > 0 && parts[0] !== "store" && parts[0] !== "checkout" && parts[0] !== "api") {
        return parts[0];
      }
    }
    return "";
  };

  useEffect(() => {
    const slug = getCompanySlug();
    checkSession(slug);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
  };

  const handleLogout = async () => {
    setUserDropdownOpen(false);
    setMobileMenuOpen(false);
    await logout(getCompanySlug());
  };

  const navigateToAccount = (tab?: string) => {
    setUserDropdownOpen(false);
    setMobileMenuOpen(false);
    const slug = getCompanySlug();
    const path = slug ? `/${slug}/store/account${tab ? `?tab=${tab}` : ""}` : `/store/account${tab ? `?tab=${tab}` : ""}`;
    router.push(path);
  };

  const navCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) return [];
    if (theme.featuredCategoryIds && theme.featuredCategoryIds.length > 0) {
      const selectedSet = new Set(theme.featuredCategoryIds.map(Number));
      return categories.filter((c) => selectedSet.has(Number(c.id)));
    }
    const topLevel = categories.filter((c) => c.level === 1);
    return topLevel.length > 0 ? topLevel : categories;
  }, [categories, theme.featuredCategoryIds]);

  const firstName = customer?.name ? customer.name.split(" ")[0] : "Customer";

  return (
    <header
      className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm transition-all"
      style={{ fontFamily: theme.fontFamily }}
    >
      {/* Top Banner / Announcement */}
      <div
        className="px-4 py-1.5 text-center text-xs font-medium text-white transition-colors"
        style={{ backgroundColor: theme.primaryColor }}
      >
        <span>Free shipping on orders over $50 | 100% Secure Checkout</span>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Left: Mobile Menu Button & Brand Logo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 focus:outline-none md:hidden cursor-pointer"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Logo */}
            <a href={`/${getCompanySlug()}/store`} className="flex items-center gap-2">
              {theme.logoUrl ? (
                <img src={theme.logoUrl} alt="Store Logo" className="h-9 w-auto max-w-[150px] object-contain" />
              ) : (
                <span className="text-xl font-bold tracking-tight text-gray-900">Store</span>
              )}
            </a>
          </div>

          {/* Center: Search Bar */}
          <form onSubmit={handleSearchSubmit} className="hidden flex-1 max-w-md md:block">
            <div className="relative">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-4 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:bg-white focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                aria-label="Search"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          {/* Right Actions: Wishlist, Cart, User Account / Sign-in */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Wishlist */}
            <button
              type="button"
              onClick={onOpenWishlist}
              className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
              aria-label="Wishlist"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {wishlistCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: theme.secondaryColor }}
                >
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* Cart Icon */}
            <button
              type="button"
              onClick={onOpenCart}
              className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
              aria-label="Cart"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {cartCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {cartCount}
                </span>
              )}
            </button>

            {/* User Auth Section: Unauthenticated vs Authenticated */}
            {!isAuthenticated ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Sign In
              </button>
            ) : (
              <div className="relative hidden sm:flex items-center gap-1.5">
                {/* User Profile Button ("Hi, Name") -> Navigates to Account Page */}
                <button
                  type="button"
                  onClick={() => navigateToAccount()}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                  title="View My Account & Orders"
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    {firstName[0]?.toUpperCase() || "U"}
                  </div>
                  <span>Hi, {firstName}</span>
                </button>

                {/* Logout Icon Button next to "Hi, Name" */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  title="Log Out"
                  aria-label="Logout"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Category Navigation */}
        {navCategories.length > 0 && (
          <nav className="hidden md:flex space-x-8 border-t border-gray-100 py-2.5">
            <button
              onClick={() => onSelectCategory && onSelectCategory("all")}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
            >
              All Categories
            </button>
            {navCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onSelectCategory && onSelectCategory(cat.name)}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
              >
                {cat.name}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 pt-3 pb-6 space-y-4">
          <form onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none"
            />
          </form>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Categories</div>
            <button
              onClick={() => {
                onSelectCategory?.("all");
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left rounded-md px-3 py-2 text-base font-medium text-gray-800 hover:bg-gray-50"
            >
              All Products
            </button>
            {navCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  onSelectCategory?.(cat.name);
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left rounded-md px-3 py-2 text-base font-medium text-gray-600 hover:bg-gray-50"
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-gray-100 space-y-2">
            {!isAuthenticated ? (
              <button
                onClick={() => {
                  onOpenAuth?.();
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity cursor-pointer"
                style={{ backgroundColor: theme.primaryColor }}
              >
                Sign In / Register
              </button>
            ) : (
              <div className="space-y-2">
                <div className="px-2 py-1 text-sm font-bold text-gray-900">
                  Logged in as {customer?.name || "Customer"}
                </div>
                <button
                  onClick={() => navigateToAccount("orders")}
                  className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100"
                >
                  📦 My Orders (Online & POS)
                </button>
                <button
                  onClick={() => navigateToAccount("addresses")}
                  className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100"
                >
                  📍 Saved Addresses
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default StorefrontHeader;
