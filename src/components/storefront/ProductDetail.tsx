"use client";

import React, { useState } from "react";
import { StorefrontTheme, StorefrontProduct } from "./types";

export interface ProductDetailProps {
  theme: StorefrontTheme;
  product: StorefrontProduct;
  onAddToCart?: (product: StorefrontProduct, selectedOptions: Record<string, string>, quantity: number) => void;
  onToggleWishlist?: (product: StorefrontProduct) => void;
  isWishlisted?: boolean;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({
  theme,
  product,
  onAddToCart,
  onToggleWishlist,
  isWishlisted = false,
}) => {
  const images = product.images.length > 0
    ? product.images
    : ["https://via.placeholder.com/600"];

  const [selectedImage, setSelectedImage] = useState<string>(images[0]);
  const [quantity, setQuantity] = useState<number>(1);

  // Initialize selected options map
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (product.options) {
      product.options.forEach((opt) => {
        if (opt.values.length > 0) {
          initial[opt.name] = opt.values[0];
        }
      });
    }
    return initial;
  });

  const handleOptionSelect = (optionName: string, value: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [optionName]: value,
    }));
  };

  return (
    <div className="py-8 bg-white" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          
          {/* Left Column: Image Gallery */}
          <div className="space-y-4">
            <div className="aspect-square w-full overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 relative">
              <img
                src={selectedImage}
                alt={product.name}
                className="h-full w-full object-cover object-center"
              />
              {!product.inStock && (
                <span className="absolute top-4 left-4 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-md">
                  Out of Stock
                </span>
              )}
            </div>

            {/* Image Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImage(img)}
                    className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                      selectedImage === img
                        ? "border-blue-600 ring-2 ring-blue-100"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    style={selectedImage === img ? { borderColor: theme.primaryColor } : undefined}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Product Info & Actions */}
          <div className="flex flex-col space-y-6">
            <div>
              {product.category && (
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {product.category}
                </span>
              )}
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {product.name}
              </h1>

              {/* Price & Stock Badge */}
              <div className="mt-4 flex items-center gap-4">
                <span className="text-3xl font-extrabold text-gray-900">
                  ${product.effectivePrice.toFixed(2)}
                </span>
                {product.compareAtPrice && product.compareAtPrice > product.effectivePrice && (
                  <span className="text-lg text-gray-400 line-through">
                    ${product.compareAtPrice.toFixed(2)}
                  </span>
                )}
                {product.compareAtPrice && product.compareAtPrice > product.effectivePrice && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: theme.secondaryColor }}
                  >
                    Save ${(product.compareAtPrice - product.effectivePrice).toFixed(2)}
                  </span>
                )}
              </div>

              {/* Stock Status Indicator */}
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    product.inStock ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span className="text-sm font-medium text-gray-600">
                  {product.inStock ? "In Stock & Ready to Ship" : "Currently Out of Stock"}
                </span>
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <p className="text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                {product.description}
              </p>
            )}

            {/* Dynamic Product Variant Selectors */}
            {product.options && product.options.length > 0 && (
              <div className="space-y-4 border-t border-gray-100 pt-4">
                {product.options.map((option) => (
                  <div key={option.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select {option.name}: <span className="font-semibold text-gray-900">{selectedOptions[option.name]}</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {option.values.map((val) => {
                        const isSelected = selectedOptions[option.name] === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleOptionSelect(option.name, val)}
                            className={`rounded-lg px-4 py-2 text-sm font-medium border transition-all ${
                              isSelected
                                ? "text-white shadow-sm"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                            style={isSelected ? { backgroundColor: theme.primaryColor, borderColor: theme.primaryColor } : undefined}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity Selector */}
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Quantity</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={!product.inStock || quantity <= 1}
                    className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-40"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-semibold text-sm text-gray-900">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    disabled={!product.inStock}
                    className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Actions: Add to Cart & Wishlist */}
            <div className="flex gap-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                disabled={!product.inStock}
                onClick={() => onAddToCart?.(product, selectedOptions, quantity)}
                className={`flex-1 rounded-xl py-3.5 px-6 text-base font-semibold transition-all shadow-md ${
                  product.inStock
                    ? "text-white hover:opacity-90 active:scale-98"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200 shadow-none"
                }`}
                style={product.inStock ? { backgroundColor: theme.primaryColor } : undefined}
              >
                {product.inStock ? "Add to Cart" : "Out of Stock"}
              </button>

              <button
                type="button"
                onClick={() => onToggleWishlist?.(product)}
                className={`rounded-xl border p-3.5 transition-colors ${
                  isWishlisted
                    ? "border-red-200 bg-red-50 text-red-600"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
                aria-label="Wishlist"
              >
                <svg className="h-6 w-6" fill={isWishlisted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
