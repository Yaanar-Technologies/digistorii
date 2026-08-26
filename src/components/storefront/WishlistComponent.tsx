"use client";

import React from "react";
import { StorefrontTheme, WishlistItemType } from "./types";

export interface WishlistComponentProps {
  theme: StorefrontTheme;
  items: WishlistItemType[];
  onMoveToCart?: (item: WishlistItemType) => void;
  onAddToCart?: (item: WishlistItemType) => void;
  onRemoveItem?: (variantId: number) => void;
  onContinueShopping?: () => void;
}

export const WishlistComponent: React.FC<WishlistComponentProps> = ({
  theme,
  items,
  onMoveToCart,
  onAddToCart,
  onRemoveItem,
  onContinueShopping,
}) => {
  return (
    <div className="py-10 bg-white min-h-[60vh]" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-100 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">My Wishlist</h1>
            <p className="mt-1 text-sm text-gray-500">
              {items.length} saved {items.length === 1 ? "item" : "items"}
            </p>
          </div>
          <button
            onClick={onContinueShopping}
            className="text-sm font-semibold hover:underline"
            style={{ color: theme.primaryColor }}
          >
            ← Continue Shopping
          </button>
        </div>

        {items.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <h2 className="text-lg font-bold text-gray-800">Your wishlist is empty</h2>
            <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
              Save items you love to review later or add to your cart anytime.
            </p>
            <button
              onClick={onContinueShopping}
              className="mt-6 inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: theme.primaryColor }}
            >
              Explore Products
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
              <div
                key={item.variantId}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
                  <img
                    src={item.image || "https://via.placeholder.com/400"}
                    alt={item.productName}
                    className="h-full w-full object-cover object-center"
                  />
                  {!item.inStock && (
                    <span className="absolute top-3 left-3 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
                      Out of Stock
                    </span>
                  )}
                  <button
                    onClick={() => onRemoveItem?.(item.variantId)}
                    className="absolute top-3 right-3 rounded-full bg-white/80 p-2 text-gray-400 backdrop-blur-sm hover:text-red-500"
                    aria-label="Remove from wishlist"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">
                    {item.productName}
                  </h3>
                  <div className="mt-1 text-base font-bold text-gray-900">
                    ${item.price.toFixed(2)}
                  </div>

                  <div className="mt-4 pt-2">
                    <button
                      type="button"
                      disabled={!item.inStock}
                      onClick={() => (onMoveToCart || onAddToCart)?.(item)}
                      className={`w-full rounded-xl py-2 px-3 text-xs font-semibold transition-all ${
                        item.inStock
                          ? "text-white hover:opacity-90"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                      }`}
                      style={item.inStock ? { backgroundColor: theme.primaryColor } : undefined}
                    >
                      {item.inStock ? "Move to Cart" : "Out of Stock"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WishlistComponent;
