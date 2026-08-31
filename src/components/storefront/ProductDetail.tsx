"use client";

import React, { useState, useEffect } from "react";
import { StorefrontTheme, StorefrontProduct, SiblingVariant } from "./types";
import { formatPrice } from "@/lib/currency";

export interface ProductDetailProps {
  theme: StorefrontTheme;
  product: StorefrontProduct;
  onAddToCart?: (
    product: StorefrontProduct,
    selectedOptions: Record<string, string>,
    quantity: number,
    resolvedVariantId?: number
  ) => void;
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
  // Sibling variants logic
  const siblings = product.variants && product.variants.length > 0 ? product.variants : [];
  
  // Track active variant
  const [activeVariant, setActiveVariant] = useState<SiblingVariant | null>(() => {
    if (siblings.length > 0) {
      const match = siblings.find((v) => v.variantId === product.variantId);
      return match || siblings[0];
    }
    return null;
  });

  // Extract distinct colors and sizes across siblings
  const distinctColors = Array.from(
    new Set(siblings.map((v) => v.color).filter(Boolean))
  ) as string[];

  const distinctSizes = Array.from(
    new Set(siblings.map((v) => v.size).filter(Boolean))
  ) as string[];

  // Currently selected option state
  const [selectedColor, setSelectedColor] = useState<string>(
    activeVariant?.color || distinctColors[0] || ""
  );
  const [selectedSize, setSelectedSize] = useState<string>(
    activeVariant?.size || distinctSizes[0] || ""
  );

  // Sync active variant when selection changes
  useEffect(() => {
    if (siblings.length > 0) {
      let matched = siblings.find((v) => {
        const colorMatch = !distinctColors.length || v.color === selectedColor;
        const sizeMatch = !distinctSizes.length || v.size === selectedSize;
        return colorMatch && sizeMatch;
      });
      
      if (!matched) {
        matched = siblings.find((v) => v.color === selectedColor) || siblings[0];
      }
      
      if (matched) {
        setActiveVariant(matched);
      }
    }
  }, [selectedColor, selectedSize, siblings, distinctColors.length, distinctSizes.length]);

  // Derived current product specs
  const images = activeVariant?.images && activeVariant.images.length > 0
    ? activeVariant.images
    : product.images.length > 0
    ? product.images
    : ["https://placehold.co/600x600?text=No+Image+Available"];

  const currentPrice = activeVariant ? activeVariant.effectivePrice : product.effectivePrice;
  const compareAtPrice = activeVariant ? activeVariant.compareAtPrice : product.compareAtPrice;
  const currentAvailableQty = activeVariant ? activeVariant.availableQty : (product.availableQty ?? (product.inStock ? 10 : 0));
  const currentLowStockThreshold = activeVariant ? activeVariant.lowStockThreshold : (product.lowStockThreshold ?? 5);
  const isInStock = activeVariant ? activeVariant.inStock : product.inStock;

  const [selectedImage, setSelectedImage] = useState<string>(images[0] || "");
  const [quantity, setQuantity] = useState<number>(1);

  // Accordion state
  const [accordionOpen, setAccordionOpen] = useState<{
    details: boolean;
    description: boolean;
    delivery: boolean;
  }>({
    details: true,
    description: true,
    delivery: true,
  });

  useEffect(() => {
    if (images.length > 0 && !images.includes(selectedImage)) {
      setSelectedImage(images[0]);
    }
  }, [images, selectedImage]);

  // Next / Prev main image controls
  const handlePrevImage = () => {
    const currentIndex = images.indexOf(selectedImage);
    const prevIndex = (currentIndex - 1 + images.length) % images.length;
    setSelectedImage(images[prevIndex]);
  };

  const handleNextImage = () => {
    const currentIndex = images.indexOf(selectedImage);
    const nextIndex = (currentIndex + 1) % images.length;
    setSelectedImage(images[nextIndex]);
  };

  const toggleAccordion = (section: "details" | "description" | "delivery") => {
    setAccordionOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Build specifications list for Product Details grid
  const rawSpecs = product.specifications && product.specifications.length > 0
    ? product.specifications
    : [];

  const defaultSpecs = [
    { label: "Color", value: activeVariant?.color || product.material || "Pink / Gold" },
    { label: "Base Code", value: activeVariant?.sku || product.productCode || "VNA092" },
    { label: "Body Design", value: "Butta" },
    { label: "Washcare", value: "Dry Wash" },
    { label: "Fabric", value: product.material || "Banana Pith" },
    { label: "Zari", value: "Jute Zari" },
    { label: "Border Style", value: "Self" },
    { label: "Blouse Style", value: "Matching" },
    { label: "Weight", value: product.weight ? `${product.weight} kg` : "0.6000" },
  ];

  const specGrid = rawSpecs.length > 0 ? rawSpecs : defaultSpecs;

  return (
    <div className="py-6 bg-[#FAFAF8] min-h-screen text-gray-900" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          
          {/* Left Column: Image Gallery (Span 7) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="aspect-[4/3] sm:aspect-[1/1] w-full overflow-hidden rounded-md bg-gray-100 relative group border border-gray-200 shadow-sm">
              <img
                src={selectedImage}
                alt={product.name}
                className="h-full w-full object-cover object-center transition-all duration-300"
              />

              {/* Prev / Next Arrows */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 hover:bg-white text-gray-800 flex items-center justify-center shadow-md transition-transform hover:scale-105"
                    aria-label="Previous image"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleNextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 hover:bg-white text-gray-800 flex items-center justify-center shadow-md transition-transform hover:scale-105"
                    aria-label="Next image"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}

              {!isInStock && (
                <span className="absolute top-4 left-4 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-md">
                  Out of Stock
                </span>
              )}
            </div>

            {/* Thumbnail Row */}
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {images.map((img, idx) => {
                  const isSelected = selectedImage === img;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedImage(img)}
                      className={`relative h-24 w-20 flex-shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                        isSelected
                          ? "border-black ring-1 ring-black"
                          : "border-gray-200 hover:border-gray-400 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <img src={img} alt={`Thumbnail ${idx + 1}`} className="h-full w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Product Details & Controls (Span 5) */}
          <div className="lg:col-span-5 flex flex-col space-y-5">
            
            {/* Title & Wishlist Header */}
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-gray-800 leading-snug">
                  {product.name}
                </h1>
                <button
                  type="button"
                  onClick={() => onToggleWishlist?.(product)}
                  className="p-1 text-gray-500 hover:text-red-500 transition-colors flex-shrink-0"
                  aria-label="Add to wishlist"
                >
                  <svg
                    className={`h-6 w-6 ${isWishlisted ? "fill-red-500 stroke-red-500" : "fill-none stroke-gray-600 hover:stroke-red-500"}`}
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                </button>
              </div>

              {product.category && (
                <a
                  href="#"
                  className="inline-block text-xs font-normal text-gray-500 underline hover:text-gray-800"
                >
                  {product.category}
                </a>
              )}
            </div>

            {/* Price & Share */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl sm:text-3xl font-semibold text-gray-900">
                  {formatPrice(currentPrice)}
                </span>
                {compareAtPrice && compareAtPrice > currentPrice && (
                  <span className="text-base text-gray-400 line-through">
                    {formatPrice(compareAtPrice)}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="p-1.5 text-gray-500 hover:text-gray-900 transition-colors"
                title="Share product"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100-5.367 3 3 0 000 5.367zm0 8.974a3 3 0 100-5.366 3 3 0 000 5.366z" />
                </svg>
              </button>
            </div>

            {/* Promotional Badge Banner (Stitching badge from reference) */}
            <div className="flex items-center gap-3 p-2 border border-emerald-200 bg-emerald-50/50 rounded-md w-fit cursor-pointer hover:bg-emerald-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold text-xs flex-shrink-0">
                🪡
              </div>
              <div className="text-xs">
                <span className="font-semibold text-gray-800 block">Click here for STITCHING</span>
                <span className="text-gray-500 text-[11px]">Custom tailoring available for blouse & saree</span>
              </div>
            </div>

            {/* Dynamic Variant Selectors (Color / Size) */}
            {distinctColors.length > 1 && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Color: <span className="text-gray-900 font-normal">{selectedColor}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {distinctColors.map((color) => {
                    const isSelected = selectedColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-all ${
                          isSelected
                            ? "border-black bg-black text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        {color}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {distinctSizes.length > 1 && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Size: <span className="text-gray-900 font-normal">{selectedSize}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {distinctSizes.map((size) => {
                    const isSelected = selectedSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setSelectedSize(size)}
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-all ${
                          isSelected
                            ? "border-black bg-black text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            <div className="space-y-1">
              <span className="block text-xs text-gray-500">Quantity:</span>
              <div className="flex items-center w-32 border border-gray-300 rounded bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={!isInStock || quantity <= 1}
                  className="w-10 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-base"
                >
                  -
                </button>
                <span className="flex-1 text-center font-medium text-sm text-gray-900">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  disabled={!isInStock}
                  className="w-10 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-base"
                >
                  +
                </button>
              </div>
            </div>

            {/* Urgency Stock Badge ("Only 1 unit left") */}
            {isInStock && currentAvailableQty <= currentLowStockThreshold && (
              <div className="flex items-center gap-1.5 text-red-600 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                <span>Only {currentAvailableQty} unit{currentAvailableQty > 1 ? "s" : ""} left</span>
              </div>
            )}

            {/* Add to Cart Button */}
            <div>
              <button
                type="button"
                disabled={!isInStock}
                onClick={() =>
                  onAddToCart?.(
                    product,
                    { Color: selectedColor, Size: selectedSize },
                    quantity,
                    activeVariant?.variantId || product.variantId
                  )
                }
                className={`w-full py-3.5 px-6 font-semibold uppercase tracking-wider text-sm transition-all shadow-sm ${
                  isInStock
                    ? "bg-black text-white hover:bg-gray-800 active:scale-[0.99]"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isInStock ? "ADD TO CART" : "OUT OF STOCK"}
              </button>
            </div>

            {/* Accordion Sections */}
            <div className="border-t border-gray-200 pt-3 space-y-3">
              
              {/* Accordion 1: Product Details */}
              <div className="border-b border-gray-200 pb-3">
                <button
                  type="button"
                  onClick={() => toggleAccordion("details")}
                  className="w-full flex items-center justify-between py-1 text-left text-sm font-semibold text-gray-800 hover:text-gray-900"
                >
                  <span>Product Details</span>
                  <span className="text-gray-500 text-base">{accordionOpen.details ? "▲" : "▼"}</span>
                </button>

                {accordionOpen.details && (
                  <div className="mt-3 grid grid-cols-3 gap-y-4 gap-x-2 text-xs">
                    {specGrid.map((spec, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <span className="font-semibold text-gray-800 block">{spec.label}</span>
                        <span className="text-gray-600 block truncate">{spec.value || "-"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Accordion 2: Product Description */}
              <div className="border-b border-gray-200 pb-3">
                <button
                  type="button"
                  onClick={() => toggleAccordion("description")}
                  className="w-full flex items-center justify-between py-1 text-left text-sm font-semibold text-gray-800 hover:text-gray-900"
                >
                  <span>Product Description</span>
                  <span className="text-gray-500 text-base">{accordionOpen.description ? "▲" : "▼"}</span>
                </button>

                {accordionOpen.description && (
                  <div className="mt-3 space-y-2 text-xs text-gray-600 leading-relaxed">
                    <p>{product.description || "High-quality saree crafted with traditional motifs and fine materials."}</p>
                    <p className="italic text-gray-400">Note: Slight colour variation of product images due to digital photography or settings on your device</p>
                  </div>
                )}
              </div>

              {/* Accordion 3: Delivery */}
              <div className="border-b border-gray-200 pb-3">
                <button
                  type="button"
                  onClick={() => toggleAccordion("delivery")}
                  className="w-full flex items-center justify-between py-1 text-left text-sm font-semibold text-gray-800 hover:text-gray-900"
                >
                  <span>Delivery</span>
                  <span className="text-gray-500 text-base">{accordionOpen.delivery ? "▲" : "▼"}</span>
                </button>

                {accordionOpen.delivery && (
                  <div className="mt-3 space-y-3 text-xs text-gray-600 leading-relaxed">
                    <div>
                      <span className="font-bold text-gray-800 uppercase block">DELIVERY DETAILS:</span>
                      <span className="font-semibold text-gray-700 block mt-1">Order Processing Timespan:</span>
                      <p>All orders will be processed within 48 hours of the order date.</p>
                    </div>

                    <div>
                      <span className="font-semibold text-gray-700 block">Domestic Order Delivery Timespan:</span>
                      <ul className="list-disc pl-4 space-y-1 mt-1">
                        <li>The expected delivery time for domestic shipments is 5 to 7 business days from the date of order.</li>
                        <li>Please note that the standard domestic delivery timeframe does not apply to tailored orders.</li>
                        <li>Products with stitching require an additional 4 to 5 business days for delivery.</li>
                        <li>Products with embroidery work require an additional 7 to 10 business days for delivery.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
