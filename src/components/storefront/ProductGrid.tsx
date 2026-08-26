"use client";

import React, { useState, useMemo } from "react";
import { StorefrontTheme, StorefrontProduct } from "./types";

export interface ProductGridProps {
  theme: StorefrontTheme;
  products: StorefrontProduct[];
  categories?: string[];
  onProductClick?: (product: StorefrontProduct) => void;
  onAddToCart?: (product: StorefrontProduct) => void;
  onToggleWishlist?: (product: StorefrontProduct) => void;
  wishlistIds?: number[];
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  theme,
  products,
  categories = [],
  onProductClick,
  onAddToCart,
  onToggleWishlist,
  wishlistIds = [],
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [maxPriceFilter, setMaxPriceFilter] = useState<number | undefined>(undefined);
  const [inStockOnlyFilter, setInStockOnlyFilter] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc">("featured");

  // Highest price calculation for slider
  const maxProductPrice = useMemo(() => {
    if (products.length === 0) return 500;
    return Math.max(...products.map((p) => p.effectivePrice));
  }, [products]);

  // Derived filtered products
  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        // Category filter
        if (selectedCategory !== "all" && product.category?.toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
        // Search query
        if (searchQuery.trim() !== "") {
          const q = searchQuery.toLowerCase();
          const matchName = product.name.toLowerCase().includes(q);
          const matchDesc = product.description?.toLowerCase().includes(q);
          if (!matchName && !matchDesc) return false;
        }
        // Price filter
        if (maxPriceFilter !== undefined && product.effectivePrice > maxPriceFilter) {
          return false;
        }
        // In-stock toggle (user optional filter)
        if (inStockOnlyFilter && !product.inStock) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "price-asc") return a.effectivePrice - b.effectivePrice;
        if (sortBy === "price-desc") return b.effectivePrice - a.effectivePrice;
        return a.sortOrder - b.sortOrder;
      });
  }, [products, selectedCategory, searchQuery, maxPriceFilter, inStockOnlyFilter, sortBy]);

  return (
    <section className="py-10 bg-white" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header Title & Top Controls */}
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Featured Products</h2>
            <p className="mt-1 text-sm text-gray-500">
              Showing {filteredProducts.length} of {products.length} items
            </p>
          </div>

          {/* Sort Selector & Quick Search */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Filter catalog..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:bg-white focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "featured" | "price-asc" | "price-desc")}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 focus:outline-none"
            >
              <option value="featured">Featured Sort</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Left Sidebar Filters */}
          <aside className="space-y-6 lg:col-span-1">
            {/* Category Filter */}
            {categories.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Categories</h3>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`block w-full text-left rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      selectedCategory === "all"
                        ? "bg-gray-100 font-semibold text-gray-900"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    All Categories
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`block w-full text-left rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                        selectedCategory.toLowerCase() === cat.toLowerCase()
                          ? "bg-gray-100 font-semibold text-gray-900"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price Filter */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Max Price</h3>
              <div className="space-y-2">
                <input
                  type="range"
                  min={0}
                  max={Math.ceil(maxProductPrice)}
                  value={maxPriceFilter ?? Math.ceil(maxProductPrice)}
                  onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
                  className="w-full accent-blue-600"
                  style={{ accentColor: theme.primaryColor }}
                />
                <div className="flex justify-between text-xs text-gray-500 font-medium">
                  <span>$0</span>
                  <span>${maxPriceFilter ?? Math.ceil(maxProductPrice)}</span>
                </div>
              </div>
            </div>

            {/* In Stock Filter */}
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={inStockOnlyFilter}
                  onChange={(e) => setInStockOnlyFilter(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                In-Stock Only
              </label>
            </div>
          </aside>

          {/* Product Grid Area */}
          <div className="lg:col-span-3">
            {filteredProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-gray-500">No products match your selected criteria.</p>
                <button
                  onClick={() => {
                    setSelectedCategory("all");
                    setSearchQuery("");
                    setMaxPriceFilter(undefined);
                    setInStockOnlyFilter(false);
                  }}
                  className="mt-4 text-sm font-semibold hover:underline"
                  style={{ color: theme.primaryColor }}
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((product) => {
                  const isWishlisted = wishlistIds.includes(product.variantId);
                  return (
                    <div
                      key={product.variantId}
                      className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md"
                    >
                      {/* Product Image & Badges */}
                      <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
                        <img
                          src={product.images[0] || "https://via.placeholder.com/400"}
                          alt={product.name}
                          onClick={() => onProductClick?.(product)}
                          className="h-full w-full object-cover object-center cursor-pointer transition-transform duration-300 group-hover:scale-105"
                        />

                        {/* Explicit Stock Badge Rule */}
                        {!product.inStock ? (
                          <span className="absolute top-3 left-3 rounded-full bg-red-600/90 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                            Out of Stock
                          </span>
                        ) : product.compareAtPrice && product.compareAtPrice > product.effectivePrice ? (
                          <span
                            className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-sm"
                            style={{ backgroundColor: theme.primaryColor }}
                          >
                            Sale
                          </span>
                        ) : null}

                        {/* Wishlist Button */}
                        <button
                          type="button"
                          onClick={() => onToggleWishlist?.(product)}
                          className="absolute top-3 right-3 rounded-full bg-white/80 p-2 text-gray-600 backdrop-blur-sm transition-colors hover:bg-white hover:text-red-500 shadow-sm"
                          aria-label="Wishlist"
                        >
                          <svg
                            className={`h-4 w-4 ${isWishlisted ? "fill-red-500 text-red-500" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>
                      </div>

                      {/* Product Content Details */}
                      <div className="flex flex-1 flex-col p-4">
                        {product.category && (
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                            {product.category}
                          </span>
                        )}
                        <h3
                          onClick={() => onProductClick?.(product)}
                          className="text-base font-semibold text-gray-900 cursor-pointer hover:underline line-clamp-1"
                        >
                          {product.name}
                        </h3>

                        {/* Price Display */}
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-lg font-bold text-gray-900">
                            ${product.effectivePrice.toFixed(2)}
                          </span>
                          {product.compareAtPrice && product.compareAtPrice > product.effectivePrice && (
                            <span className="text-xs text-gray-400 line-through">
                              ${product.compareAtPrice.toFixed(2)}
                            </span>
                          )}
                        </div>

                        {/* Add to Cart Button */}
                        <div className="mt-4 pt-2">
                          <button
                            type="button"
                            disabled={!product.inStock}
                            onClick={() => onAddToCart?.(product)}
                            className={`w-full rounded-xl py-2.5 px-4 text-sm font-semibold transition-all ${
                              product.inStock
                                ? "text-white shadow-sm hover:opacity-90 active:scale-98"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                            }`}
                            style={product.inStock ? { backgroundColor: theme.primaryColor } : undefined}
                          >
                            {product.inStock ? "Add to Cart" : "Out of Stock"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductGrid;
