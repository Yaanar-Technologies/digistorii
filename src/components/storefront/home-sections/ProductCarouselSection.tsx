"use client";

import React from "react";
import { ProductCarouselSection as ProductCarouselSectionType, StorefrontTheme, StorefrontProduct } from "../types";
import { ShoppingBagIcon } from "@heroicons/react/24/outline";

interface ProductCarouselSectionProps {
  section: ProductCarouselSectionType;
  theme: StorefrontTheme;
  products: StorefrontProduct[];
  onProductClick?: (product: StorefrontProduct) => void;
  onAddToCart?: (product: StorefrontProduct) => void;
  isPreview?: boolean;
}

export const ProductCarouselHomeSection: React.FC<ProductCarouselSectionProps> = ({
  section,
  theme,
  products = [],
  onProductClick,
  onAddToCart,
  isPreview = false,
}) => {
  let displayProducts = [...products];

  if (section.productVariantIds && section.productVariantIds.length > 0) {
    const idMap = new Map(displayProducts.map((p) => [p.variantId, p]));
    displayProducts = section.productVariantIds
      .map((id) => idMap.get(id))
      .filter((p): p is StorefrontProduct => Boolean(p));
  } else if (section.category && section.category !== "all") {
    displayProducts = displayProducts.filter(
      (p) =>
        p.category?.toLowerCase() === section.category?.toLowerCase() ||
        p.category?.toLowerCase().includes(section.category?.toLowerCase() || "")
    );
  }

  const limit = section.limit && section.limit > 0 ? section.limit : 8;
  displayProducts = displayProducts.slice(0, limit);

  if (displayProducts.length === 0) {
    if (isPreview) {
      return (
        <section className="py-8 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl m-4 bg-gray-50">
          <p className="text-sm font-medium text-gray-400">
            Product Carousel: No products found for this filter
          </p>
        </section>
      );
    }
    return null;
  }

  const sectionTitle = section.title || "Featured Products";
  const sectionSubtitle = section.subtitle || "Curated picks and bestsellers just for you";

  return (
    <section className="py-12 sm:py-16 bg-gray-50/50" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            {sectionTitle}
          </h2>
          {sectionSubtitle && (
            <p className="mt-2 text-sm sm:text-base text-gray-500">{sectionSubtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 sm:gap-6">
          {displayProducts.map((p) => {
            const isOutOfStock = !p.inStock;
            const primaryImage =
              p.images?.[0] ||
              "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80";

            return (
              <div
                key={p.variantId}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                {/* Image Container */}
                <div
                  onClick={() => onProductClick && onProductClick(p)}
                  className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100 cursor-pointer"
                >
                  <img
                    src={primaryImage}
                    alt={p.name}
                    className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />

                  {/* Badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
                    {p.isNewArrival && (
                      <span className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-xs">
                        NEW
                      </span>
                    )}
                    {p.isOnSale && (
                      <span
                        className="rounded-md px-2 py-1 text-[11px] font-bold text-white shadow-xs"
                        style={{ backgroundColor: theme.secondaryColor || "#dc2626" }}
                      >
                        {p.discountBadgeText || "SALE"}
                      </span>
                    )}
                    {isOutOfStock && (
                      <span className="rounded-md bg-gray-900/80 backdrop-blur-xs px-2 py-1 text-[11px] font-medium text-white">
                        Out of Stock
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="mt-3 flex-1 flex flex-col justify-between">
                  <div>
                    {p.category && (
                      <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                        {p.category}
                      </span>
                    )}
                    <h3
                      onClick={() => onProductClick && onProductClick(p)}
                      className="font-semibold text-gray-900 text-sm line-clamp-2 mt-0.5 hover:text-brand-600 transition-colors cursor-pointer"
                    >
                      {p.name}
                    </h3>
                  </div>

                  {/* Pricing and Add to Cart */}
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-50">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-gray-900">
                        ${p.effectivePrice.toFixed(2)}
                      </span>
                      {p.compareAtPrice && p.compareAtPrice > p.effectivePrice && (
                        <span className="text-xs text-gray-400 line-through">
                          ${p.compareAtPrice.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => onAddToCart && onAddToCart(p)}
                      className="rounded-xl p-2 text-white shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      style={{ backgroundColor: theme.primaryColor || "#2563eb" }}
                      title={isOutOfStock ? "Out of Stock" : "Add to Cart"}
                      aria-label="Add to cart"
                    >
                      <ShoppingBagIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ProductCarouselHomeSection;
