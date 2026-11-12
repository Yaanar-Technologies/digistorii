"use client";

import React, { useState, useMemo } from "react";
import { StorefrontTheme, StorefrontProduct } from "./types";
import { formatPrice } from "@/lib/currency";
import { QuickViewModal } from "./QuickViewModal";
import { useWishlistStore } from "@/store/wishlistStore";

export interface ProductGridProps {
  theme: StorefrontTheme;
  company?: string;
  products: StorefrontProduct[];
  categories?: string[];
  onProductClick?: (product: StorefrontProduct) => void;
  onAddToCart?: (product: StorefrontProduct, quantity?: number) => void;
  onToggleWishlist?: (product: StorefrontProduct) => void;
  wishlistIds?: number[];
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  initialSearch?: string;
  title?: string;
  subtitle?: string;
  // Server-side pagination and controls
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  sortBy?: "featured" | "price-asc" | "price-desc" | "newest";
  onSortChange?: (sort: "featured" | "price-asc" | "price-desc" | "newest") => void;
  inStockOnly?: boolean;
  onToggleInStock?: (inStock: boolean) => void;
  maxPriceFilter?: number;
  onMaxPriceFilterChange?: (maxPrice: number | undefined) => void;
}

interface ProductCardProps {
  product: StorefrontProduct;
  theme: StorefrontTheme;
  isWishlisted: boolean;
  onProductClick?: (product: StorefrontProduct) => void;
  onToggleWishlist?: (product: StorefrontProduct) => void;
  onQuickView: (product: StorefrontProduct) => void;
}

const ProductCard: React.FC<ProductCardProps> = React.memo(({
  product,
  theme,
  isWishlisted,
  onProductClick,
  onToggleWishlist,
  onQuickView,
}) => {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md">
      {/* Product Image & Badges */}
      <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
        <img
          src={product.images[0] || "https://via.placeholder.com/400"}
          alt={product.name}
          onClick={() => onProductClick?.(product)}
          className="h-full w-full object-cover object-center cursor-pointer transition-transform duration-300 group-hover:scale-105"
        />

        {/* Stock / Sale / New Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1 z-10">
          {!product.inStock ? (
            <span className="rounded-full bg-red-600/90 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              Out of Stock
            </span>
          ) : (
            <>
              {product.isNewArrival && (
                <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
                  New
                </span>
              )}
              {(product.isOnSale || (product.compareAtPrice && product.compareAtPrice > product.effectivePrice)) && (
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-sm"
                  style={{ backgroundColor: theme.primaryColor || "#ef4444" }}
                >
                  {product.discountBadgeText || "Sale"}
                </span>
              )}
            </>
          )}
        </div>

        {/* Quick View Eye + Wishlist Heart Overlay Buttons */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          {/* Quick View Eye Button (Hover-only on desktop, always visible on mobile/touch) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickView(product);
            }}
            className="rounded-full bg-white/80 p-2 text-gray-700 backdrop-blur-sm transition-all hover:bg-white hover:text-black shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            aria-label="Quick View"
            title="Quick View"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>

          {/* Wishlist Button (Always visible on all devices) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist?.(product);
            }}
            className="rounded-full bg-white/80 p-2 text-gray-600 backdrop-blur-sm transition-colors hover:bg-white hover:text-red-500 shadow-sm"
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
      </div>

      {/* Product Content Details */}
      <div className="flex flex-1 flex-col p-4">
        <h3
          onClick={() => onProductClick?.(product)}
          className="text-base font-semibold text-gray-900 cursor-pointer hover:underline line-clamp-1"
        >
          {product.name}
        </h3>

        {/* Price Display */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-gray-900">
            {formatPrice(product.effectivePrice)}
          </span>
          {(product.isOnSale || (product.compareAtPrice && product.compareAtPrice > product.effectivePrice)) && (
            <span className="text-xs text-gray-400 line-through">
              {formatPrice(product.originalPrice || product.compareAtPrice || 0)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

ProductCard.displayName = "ProductCard";

export const ProductGrid: React.FC<ProductGridProps> = ({
  theme,
  company,
  products,
  categories = [],
  onProductClick,
  onAddToCart,
  onToggleWishlist,
  wishlistIds = [],
  selectedCategory: propSelectedCategory,
  onSelectCategory: propOnSelectCategory,
  initialSearch = "",
  title: propTitle,
  subtitle: propSubtitle,
  currentPage = 1,
  totalPages = 1,
  totalCount,
  onPageChange,
  sortBy: propSortBy,
  onSortChange,
  inStockOnly: propInStockOnly,
  onToggleInStock,
  maxPriceFilter: propMaxPriceFilter,
  onMaxPriceFilterChange,
}) => {
  const [localSelectedCategory, setLocalSelectedCategory] = useState<string>("all");
  const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProduct | null>(null);

  const toggleWishlistStoreItem = useWishlistStore((state) => state.toggleItem);
  const isInWishlistStore = useWishlistStore((state) => state.isInWishlist);

  const handleToggleWishlist = (product: StorefrontProduct) => {
    toggleWishlistStoreItem({
      variantId: product.variantId,
      productName: product.name,
      image: product.images[0],
      price: product.effectivePrice,
      compareAtPrice: product.compareAtPrice,
      inStock: product.inStock,
      category: product.category,
    });

    onToggleWishlist?.(product);

    if (company) {
      const isCurrentlyIn = isInWishlistStore(product.variantId);
      if (!isCurrentlyIn) {
        fetch(`/api/tenant/${company}/wishlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantId: product.variantId }),
        }).catch(() => {});
      } else {
        fetch(`/api/tenant/${company}/wishlist?variantId=${product.variantId}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    }
  };

  const selectedCategory = propSelectedCategory !== undefined ? propSelectedCategory : localSelectedCategory;
  const setSelectedCategory = propOnSelectCategory !== undefined ? propOnSelectCategory : setLocalSelectedCategory;
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);

  React.useEffect(() => {
    setSearchQuery(initialSearch || "");
  }, [initialSearch]);

  const [localMaxPriceFilter, setLocalMaxPriceFilter] = useState<number | undefined>(undefined);
  const [localInStockOnly, setLocalInStockOnly] = useState<boolean>(false);
  const [localSortBy, setLocalSortBy] = useState<"featured" | "price-asc" | "price-desc" | "newest">("featured");

  const maxPriceFilter = propMaxPriceFilter !== undefined ? propMaxPriceFilter : localMaxPriceFilter;
  const handleMaxPriceChange = (val: number | undefined) => {
    if (onMaxPriceFilterChange) onMaxPriceFilterChange(val);
    else setLocalMaxPriceFilter(val);
  };

  const inStockOnly = propInStockOnly !== undefined ? propInStockOnly : localInStockOnly;
  const handleToggleInStock = (checked: boolean) => {
    if (onToggleInStock) onToggleInStock(checked);
    else setLocalInStockOnly(checked);
  };

  const sortBy = propSortBy !== undefined ? propSortBy : localSortBy;
  const handleSortChange = (newSort: "featured" | "price-asc" | "price-desc" | "newest") => {
    if (onSortChange) onSortChange(newSort);
    else setLocalSortBy(newSort);
  };

  const isServerDriven = Boolean(onPageChange);

  // Highest price calculation for slider
  const maxProductPrice = useMemo(() => {
    if (products.length === 0) return 500;
    return Math.max(...products.map((p) => p.effectivePrice));
  }, [products]);

  // Derived filtered products
  const filteredProducts = useMemo(() => {
    if (isServerDriven) {
      return products;
    }
    return products
      .filter((product) => {
        // Category filter
        if (selectedCategory !== "all") {
          const prodCat = (product.category || "").toLowerCase();
          const selCat = selectedCategory.toLowerCase();
          const match = prodCat === selCat ||
            prodCat.split(">").map((s) => s.trim()).includes(selCat);
          if (!match) {
            return false;
          }
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
        if (inStockOnly && !product.inStock) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "price-asc") return a.effectivePrice - b.effectivePrice;
        if (sortBy === "price-desc") return b.effectivePrice - a.effectivePrice;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
  }, [products, isServerDriven, selectedCategory, searchQuery, maxPriceFilter, inStockOnly, sortBy]);

  return (
    <section className="py-10 bg-white" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header Title & Top Controls */}
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              {propTitle || (selectedCategory !== "all" ? selectedCategory : "Featured Products")}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {propSubtitle || `Showing ${filteredProducts.length}${totalCount !== undefined ? ` of ${totalCount}` : ` of ${products.length}`} items`}
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
              onChange={(e) => handleSortChange(e.target.value as any)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 focus:outline-none"
            >
              <option value="featured">Featured Sort</option>
              <option value="newest">Newest Arrivals</option>
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
                  onChange={(e) => handleMaxPriceChange(Number(e.target.value))}
                  className="w-full accent-blue-600"
                  style={{ accentColor: theme.primaryColor }}
                />
                <div className="flex justify-between text-xs text-gray-500 font-medium">
                  <span>{formatPrice(0)}</span>
                  <span>{formatPrice(maxPriceFilter ?? Math.ceil(maxProductPrice))}</span>
                </div>
              </div>
            </div>

            {/* In Stock Filter */}
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => handleToggleInStock(e.target.checked)}
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
                    handleMaxPriceChange(undefined);
                    handleToggleInStock(false);
                  }}
                  className="mt-4 text-sm font-semibold hover:underline"
                  style={{ color: theme.primaryColor }}
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.variantId}
                    product={product}
                    theme={theme}
                    isWishlisted={wishlistIds.length > 0 ? wishlistIds.includes(product.variantId) : isInWishlistStore(product.variantId)}
                    onProductClick={onProductClick}
                    onToggleWishlist={handleToggleWishlist}
                    onQuickView={setQuickViewProduct}
                  />
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100 pt-6">
                <div className="text-xs text-gray-500">
                  Showing page <span className="font-semibold text-gray-900">{currentPage}</span> of{" "}
                  <span className="font-semibold text-gray-900">{totalPages}</span>
                  {totalCount !== undefined && ` (${totalCount} total items)`}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && p > arr[idx - 1] + 1 && (
                          <span className="text-xs text-gray-400 px-1">...</span>
                        )}
                        <button
                          type="button"
                          onClick={() => onPageChange?.(p)}
                          className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            currentPage === p
                              ? "bg-gray-900 text-white shadow-sm"
                              : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                          }`}
                          style={currentPage === p ? { backgroundColor: theme.primaryColor } : {}}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    ))}
                  <button
                    type="button"
                    onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick View Modal instance (Reused single instance outside card loop) */}
      <QuickViewModal
        theme={theme}
        company={company}
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        onAddToCart={(targetProduct, qty) => {
          onAddToCart?.(targetProduct, qty);
          setQuickViewProduct(null);
        }}
        onViewDetails={(targetProduct) => {
          setQuickViewProduct(null);
          onProductClick?.(targetProduct);
        }}
      />
    </section>
  );
};

export default ProductGrid;
