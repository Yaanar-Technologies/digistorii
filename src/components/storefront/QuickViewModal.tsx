"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { StorefrontTheme, StorefrontProduct } from "./types";
import { formatPrice } from "@/lib/currency";

// Format hex code returned from database product_colors table
const formatColorHex = (hex?: string | null, fallbackColorName?: string): string => {
  if (hex && hex.trim() !== "") {
    const h = hex.trim();
    if (h.startsWith("#") || h.startsWith("rgb") || h.startsWith("hsl")) return h;
    if (/^[0-9A-Fa-f]{3,8}$/.test(h)) return `#${h}`;
    return h;
  }
  if (fallbackColorName && fallbackColorName.trim() !== "") {
    return fallbackColorName.trim().toLowerCase();
  }
  return "#e5e7eb";
};

export interface QuickViewModalProps {
  theme: StorefrontTheme;
  company?: string;
  product: StorefrontProduct | null;
  onClose: () => void;
  onAddToCart?: (product: StorefrontProduct, quantity: number) => void;
  onViewDetails?: (product: StorefrontProduct) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  theme,
  company,
  product,
  onClose,
  onAddToCart,
  onViewDetails,
}) => {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [detailData, setDetailData] = useState<{
    description: string;
    images: string[];
    variants: Array<{
      variantId: number;
      sku?: string;
      color?: string | null;
      colorHex?: string | null;
      size?: string | null;
      effectivePrice: number;
      compareAtPrice?: number;
      availableQty: number;
      inStock: boolean;
      isNewArrival?: boolean;
      images: string[];
    }>;
  } | null>(null);

  const [quantity, setQuantity] = useState<number>(1);
  const [selectedSizeVariantId, setSelectedSizeVariantId] = useState<number | null>(null);

  const requestIdRef = useRef<number>(0);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!product) {
      setLoading(false);
      setDetailData(null);
      return;
    }

    setQuantity(1);
    setDetailData(null);

    if (!company) {
      setLoading(false);
      return;
    }

    const currentReqId = ++requestIdRef.current;
    setLoading(true);

    fetch(`/api/tenant/${company}/products/${product.variantId}/detail`)
      .then((res) => res.json())
      .then((data) => {
        if (currentReqId !== requestIdRef.current) return;
        if (data.success && data.product) {
          const fetchedVariants = Array.isArray(data.variants) ? data.variants : [];
          const targetVar =
            fetchedVariants.find((v: any) => v.variantId === product.variantId) ||
            fetchedVariants[0];

          setDetailData({
            description: data.product.description || "",
            variants: fetchedVariants,
            images:
              targetVar?.images && targetVar.images.length > 0
                ? targetVar.images
                : product.images,
          });
        }
      })
      .catch((err) => {
        console.error("Failed to load product details for Quick View:", err);
      })
      .finally(() => {
        if (currentReqId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [product?.variantId, company]);

  const colorVariants = useMemo(() => {
    if (!detailData?.variants) return [];
    const colorMap = new Map<string, { variantId: number; colorHex?: string | null }>();
    detailData.variants.forEach((v) => {
      if (v.color && String(v.color).trim() !== "" && !colorMap.has(v.color)) {
        colorMap.set(v.color, { variantId: v.variantId, colorHex: v.colorHex });
      }
    });
    return Array.from(colorMap.entries()).map(([color, item]) => ({
      variantId: item.variantId,
      color,
      colorHex: item.colorHex || undefined,
    }));
  }, [detailData]);

  const sizeVariants = useMemo(() => {
    if (!detailData?.variants || detailData.variants.length === 0) return [];

    const targetVar =
      detailData.variants.find((v) => v.variantId === product?.variantId) ||
      detailData.variants[0];
    const targetColor = targetVar?.color;

    const filtered = detailData.variants.filter((v) => {
      if (!v.size || String(v.size).trim() === "") return false;
      if (targetColor) return v.color === targetColor;
      return true;
    });

    return filtered.map((v) => ({
      variantId: v.variantId,
      size: v.size!,
      originalPrice: (v as any).originalPrice || v.compareAtPrice,
      effectivePrice: v.effectivePrice,
      compareAtPrice: v.compareAtPrice,
      isOnSale: (v as any).isOnSale ?? (v.compareAtPrice ? v.compareAtPrice > v.effectivePrice : false),
      discountBadgeText: (v as any).discountBadgeText,
      availableQty: v.availableQty,
      inStock: v.inStock,
      isNewArrival: (v as any).isNewArrival,
    }));
  }, [detailData, product?.variantId]);

  useEffect(() => {
    if (!product) return;
    if (sizeVariants.length > 0) {
      const match = sizeVariants.find((sv) => sv.variantId === product.variantId);
      const firstInStock = sizeVariants.find((sv) => sv.inStock) || sizeVariants[0];
      setSelectedSizeVariantId(match ? match.variantId : firstInStock.variantId);
    } else {
      setSelectedSizeVariantId(product.variantId);
    }
  }, [sizeVariants, product?.variantId]);

  const activeSizeVariant = useMemo(() => {
    if (!sizeVariants || sizeVariants.length === 0) return null;
    return sizeVariants.find((sv) => sv.variantId === selectedSizeVariantId) || sizeVariants[0];
  }, [sizeVariants, selectedSizeVariantId]);

  const currentPrice = activeSizeVariant ? activeSizeVariant.effectivePrice : product?.effectivePrice ?? 0;
  const currentOriginalPrice = activeSizeVariant
    ? (activeSizeVariant.originalPrice || activeSizeVariant.compareAtPrice)
    : (product?.originalPrice || product?.compareAtPrice);
  const currentIsOnSale = activeSizeVariant
    ? (activeSizeVariant.isOnSale ?? (currentOriginalPrice ? currentOriginalPrice > currentPrice : false))
    : (product?.isOnSale ?? (currentOriginalPrice ? currentOriginalPrice > currentPrice : false));
  const currentBadgeText = activeSizeVariant
    ? (activeSizeVariant.discountBadgeText || product?.discountBadgeText)
    : product?.discountBadgeText;
  const currentIsNewArrival = activeSizeVariant
    ? Boolean((activeSizeVariant as any).isNewArrival)
    : Boolean(product?.isNewArrival);

  const currentInStock = activeSizeVariant ? activeSizeVariant.inStock : product?.inStock ?? false;

  const images = useMemo(() => {
    if (detailData?.images && detailData.images.length > 0) {
      return detailData.images;
    }
    if (product?.images && product.images.length > 0) {
      return product.images;
    }
    return ["https://via.placeholder.com/600x600?text=No+Image"];
  }, [detailData, product]);

  useEffect(() => {
    if (product && images.length > 1 && galleryRef.current) {
      const timer = setTimeout(() => {
        if (galleryRef.current && galleryRef.current.children[1]) {
          const secondImg = galleryRef.current.children[1] as HTMLElement;
          galleryRef.current.scrollTo({
            top: secondImg.offsetTop - 10,
            behavior: "smooth",
          });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [product?.variantId, images.length, loading]);

  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [product, onClose]);

  if (!product || !mounted) return null;

  const fullDesc = detailData?.description || product.description || "";
  const isLongDesc = fullDesc.length > 140;
  const truncatedDesc = isLongDesc ? fullDesc.slice(0, 140) + "..." : fullDesc;

  const handleAddToCartClick = () => {
    if (!currentInStock) return;
    const targetProduct: StorefrontProduct = {
      ...product,
      variantId: activeSizeVariant ? activeSizeVariant.variantId : product.variantId,
      effectivePrice: currentPrice,
      compareAtPrice: currentOriginalPrice,
      inStock: currentInStock,
    };
    onAddToCart?.(targetProduct, quantity);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 animate-fadeIn transition-opacity"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-gray-900 border border-gray-100"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: theme.fontFamily }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-30 p-2 rounded-full bg-white/80 hover:bg-gray-100 text-gray-600 hover:text-gray-900 backdrop-blur-sm transition-all shadow-md cursor-pointer"
          aria-label="Close Quick View"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Left Column: Fixed-size Image Gallery */}
        <div className="w-full md:w-1/2 bg-gray-50 flex flex-col relative border-b md:border-b-0 md:border-r border-gray-100 h-[380px] md:h-[480px] overflow-hidden">

          {/* Color Swatches Row */}
          {colorVariants.length > 1 && (
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Colors:</span>
              {colorVariants.map((cv) => {
                const hex = formatColorHex(cv.colorHex, cv.color);
                const hexLower = hex.toLowerCase();
                const isLight =
                  hexLower === "#ffffff" ||
                  hexLower === "white" ||
                  hexLower === "#f6ff75" ||
                  hexLower === "yellow" ||
                  hexLower === "#1ddd3d" ||
                  hexLower === "#14d6f0";
                return (
                  <button
                    key={cv.variantId}
                    type="button"
                    title={cv.color}
                    onClick={() => onViewDetails?.({ ...product, variantId: cv.variantId })}
                    className={`h-5 w-5 rounded-full border shadow-sm hover:scale-110 transition-transform overflow-hidden flex items-center justify-center text-[9px] font-bold cursor-pointer ${
                      isLight ? "text-gray-800 border-gray-300" : "text-white border-black/20"
                    }`}
                    style={{ backgroundColor: hex }}
                  >
                    {cv.color.charAt(0).toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}

          {/* Scrollable Gallery container with fixed height items */}
          <div
            ref={galleryRef}
            className="w-full h-full overflow-y-auto scroll-smooth snap-y snap-mandatory p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 bg-gray-100/60"
          >
            {images.map((img, idx) => (
              <div
                key={idx}
                className="w-full h-[340px] md:h-[440px] bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 snap-center flex items-center justify-center p-3"
              >
                <img
                  src={img}
                  alt={`${product.name} - view ${idx + 1}`}
                  className="h-full w-full object-contain object-center"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Details & Actions */}
        <div className="w-full md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto h-[380px] md:h-[480px] space-y-5">

          <div className="space-y-4">
            {product.category && (
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {product.category}
              </span>
            )}

            <h2 className="text-xl font-bold tracking-tight text-gray-900 leading-snug">
              {product.name}
            </h2>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-2xl font-bold text-gray-900">
                {formatPrice(currentPrice)}
              </span>
              {currentIsOnSale && currentOriginalPrice && currentOriginalPrice > currentPrice && (
                <span className="text-base text-gray-400 line-through">
                  {formatPrice(currentOriginalPrice)}
                </span>
              )}
              {currentIsNewArrival && (
                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  New Arrival
                </span>
              )}
              {currentIsOnSale && (
                <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                  {currentBadgeText || "SALE"}
                </span>
              )}
            </div>

            {loading ? (
              <div className="animate-pulse space-y-2 py-1">
                <div className="h-3.5 bg-gray-200 rounded w-full"></div>
                <div className="h-3.5 bg-gray-200 rounded w-4/5"></div>
              </div>
            ) : fullDesc ? (
              <p className="text-sm text-gray-600 leading-relaxed">
                {truncatedDesc}{" "}
                {isLongDesc && (
                  <button
                    type="button"
                    onClick={() => onViewDetails?.(product)}
                    className="font-semibold text-gray-900 underline hover:text-black transition-colors cursor-pointer"
                  >
                    ...more
                  </button>
                )}
              </p>
            ) : null}

            {loading ? (
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
                <div className="flex gap-2 animate-pulse">
                  <div className="h-9 w-12 bg-gray-200 rounded-full"></div>
                  <div className="h-9 w-12 bg-gray-200 rounded-full"></div>
                  <div className="h-9 w-12 bg-gray-200 rounded-full"></div>
                </div>
              </div>
            ) : sizeVariants.length > 1 ? (
              <div className="pt-2 border-t border-gray-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-900">
                    Select Size
                  </span>
                  {activeSizeVariant && (
                    <span className="text-xs text-gray-500 font-medium">
                      {activeSizeVariant.size}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {sizeVariants.map((sv) => {
                    const isSelected = selectedSizeVariantId === sv.variantId;
                    const inStock = sv.inStock;

                    return (
                      <button
                        key={sv.variantId}
                        type="button"
                        disabled={!inStock}
                        onClick={() => setSelectedSizeVariantId(sv.variantId)}
                        className={`h-9 min-w-[2.75rem] px-3.5 rounded-full border text-xs sm:text-sm font-medium flex items-center justify-center transition-all cursor-pointer ${isSelected
                            ? "border-gray-900 bg-gray-900 text-white shadow-sm ring-1 ring-gray-900"
                            : inStock
                              ? "border-gray-300 bg-white text-gray-800 hover:border-gray-900"
                              : "border-gray-200 bg-gray-50 text-gray-300 line-through cursor-not-allowed opacity-50"
                          }`}
                      >
                        {sv.size}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="pt-2 space-y-1.5">
              <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Quantity
              </span>
              <div className="flex items-center w-32 border border-gray-300 rounded-xl bg-white shadow-sm">
                <button
                  type="button"
                  disabled={quantity <= 1 || !currentInStock}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-base font-semibold transition-colors cursor-pointer"
                >
                  -
                </button>
                <span className="flex-1 text-center font-semibold text-sm text-gray-900">
                  {quantity}
                </span>
                <button
                  type="button"
                  disabled={!currentInStock}
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-base font-semibold transition-colors cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

          </div>

          <div className="pt-4 border-t border-gray-100 space-y-3">
            <button
              type="button"
              disabled={!currentInStock}
              onClick={handleAddToCartClick}
              className={`w-full py-3.5 px-6 rounded-xl font-bold uppercase tracking-wider text-sm transition-all shadow-md active:scale-[0.99] ${currentInStock
                  ? "text-white hover:opacity-90 cursor-pointer"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none border border-gray-200"
                }`}
              style={currentInStock ? { backgroundColor: theme.primaryColor } : undefined}
            >
              {currentInStock ? "Add to Cart" : "Out of Stock"}
            </button>

            <button
              type="button"
              onClick={() => onViewDetails?.(product)}
              className="w-full text-center text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors py-1 cursor-pointer"
            >
              View Full Product Details &rarr;
            </button>
          </div>

        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default QuickViewModal;