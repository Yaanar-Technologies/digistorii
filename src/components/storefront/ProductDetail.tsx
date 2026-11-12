"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { StorefrontTheme, StorefrontProduct, SiblingVariant, FooterSettings } from "./types";
import { formatPrice } from "@/lib/currency";
import { useWishlistStore } from "@/store/wishlistStore";

export interface ProductDetailProps {
  theme: StorefrontTheme;
  product: StorefrontProduct;
  footerSettings?: FooterSettings;
  company?: string;
  onAddToCart?: (
    product: StorefrontProduct,
    selectedOptions: Record<string, string>,
    quantity: number,
    resolvedVariantId?: number
  ) => void;
  onToggleWishlist?: (product: StorefrontProduct) => void;
  isWishlisted?: boolean;
  onSelectCategory?: (category: string) => void;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({
  theme,
  product,
  footerSettings,
  company,
  onAddToCart,
  onToggleWishlist,
  isWishlisted: propIsWishlisted,
  onSelectCategory,
}) => {
  const router = useRouter();
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

  const uniqueImages = useMemo(() => Array.from(new Set(images)), [images]);

  const currentPrice = activeVariant ? activeVariant.effectivePrice : product.effectivePrice;
  const originalPrice = activeVariant
    ? (activeVariant.originalPrice || activeVariant.compareAtPrice)
    : (product.originalPrice || product.compareAtPrice);
  const isOnSale = activeVariant
    ? (activeVariant.isOnSale ?? (originalPrice ? originalPrice > currentPrice : false))
    : (product.isOnSale ?? (originalPrice ? originalPrice > currentPrice : false));
  const discountBadgeText = activeVariant
    ? (activeVariant.discountBadgeText || product.discountBadgeText)
    : product.discountBadgeText;
  const savingsAmount = activeVariant
    ? (activeVariant.savingsAmount || (originalPrice ? originalPrice - currentPrice : 0))
    : (product.savingsAmount || (originalPrice ? originalPrice - currentPrice : 0));
  const isNewArrival = activeVariant
    ? Boolean(activeVariant.isNewArrival)
    : Boolean(product.isNewArrival);

  const currentAvailableQty = activeVariant ? activeVariant.availableQty : (product.availableQty ?? (product.inStock ? 10 : 0));
  const currentLowStockThreshold = activeVariant ? activeVariant.lowStockThreshold : (product.lowStockThreshold ?? 5);
  const isInStock = activeVariant ? activeVariant.inStock : product.inStock;

  const [selectedImage, setSelectedImage] = useState<string>(images[0] || "");
  const [quantity, setQuantity] = useState<number>(1);

  const currentVariantId = activeVariant?.variantId || product.variantId;
  const toggleWishlistStoreItem = useWishlistStore((state) => state.toggleItem);
  const isInWishlistStore = useWishlistStore((state) => state.isInWishlist);
  const isWishlisted = propIsWishlisted !== undefined ? propIsWishlisted : isInWishlistStore(currentVariantId);

  const handleToggleWishlist = () => {
    toggleWishlistStoreItem({
      variantId: currentVariantId,
      productName: product.name,
      image: selectedImage || product.images[0],
      price: currentPrice,
      compareAtPrice: originalPrice,
      inStock: isInStock,
      category: product.category,
    });
  };

  // Lightbox & Pan-Zoom state
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [zoomPosition, setZoomPosition] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [isHoveringZoom, setIsHoveringZoom] = useState<boolean>(false);

  // Accordion state (only details open by default)
  const [accordionOpen, setAccordionOpen] = useState<{
    details: boolean;
    description: boolean;
    delivery: boolean;
    reviews: boolean;
  }>({
    details: true,
    description: false,
    delivery: false,
    reviews: false,
  });

  useEffect(() => {
    if (images.length > 0 && !images.includes(selectedImage)) {
      setSelectedImage(images[0]);
    }
  }, [images, selectedImage]);

  // Body scroll lock when Lightbox modal is open
  useEffect(() => {
    if (isLightboxOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isLightboxOpen]);

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

  // Keyboard controls for Lightbox (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsLightboxOpen(false);
      } else if (e.key === "ArrowLeft") {
        handlePrevImage();
      } else if (e.key === "ArrowRight") {
        handleNextImage();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, selectedImage, images]);

  // Calculate cursor-follow relative coordinates for GPU transform-origin
  const handleMouseMoveZoom = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomPosition({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  const toggleAccordion = (section: "details" | "description" | "delivery" | "reviews") => {
    setAccordionOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Reviews state
  const [reviews, setReviews] = useState<
    Array<{ id: number; customerName: string; rating: number; title: string; comment: string; createdAt: string }>
  >([]);
  const [reviewStats, setReviewStats] = useState<{
    averageRating: number;
    totalReviews: number;
    distribution: Record<number, number>;
  }>({
    averageRating: 0,
    totalReviews: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [isWritingReview, setIsWritingReview] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newAuthorName, setNewAuthorName] = useState("");
  const [newReviewTitle, setNewReviewTitle] = useState("");
  const [newReviewComment, setNewReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Back in stock notification state
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [isSubmittingNotify, setIsSubmittingNotify] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Related products state
  const [relatedProducts, setRelatedProducts] = useState<StorefrontProduct[]>([]);

  // Fetch reviews & related products
  useEffect(() => {
    if (!company || !currentVariantId) return;

    fetch(`/api/tenant/${company}/products/${currentVariantId}/reviews`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) {
          setReviews(data.reviews || []);
          if (data.stats) setReviewStats(data.stats);
        }
      })
      .catch(() => {});

    fetch(`/api/tenant/${company}/products/${currentVariantId}/related`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.products)) {
          setRelatedProducts(data.products);
        }
      })
      .catch(() => {});
  }, [company, currentVariantId]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setIsSubmittingReview(true);
    setReviewMsg(null);
    try {
      const res = await fetch(`/api/tenant/${company}/products/${currentVariantId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: newRating,
          customerName: newAuthorName,
          title: newReviewTitle,
          comment: newReviewComment,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReviewMsg({ type: "success", text: "Thank you! Your review has been published." });
        setReviews((prev) => [data.review, ...prev]);
        setReviewStats((prev) => {
          const count = prev.totalReviews + 1;
          const sum = prev.averageRating * prev.totalReviews + newRating;
          const dist = { ...prev.distribution };
          dist[newRating] = (dist[newRating] || 0) + 1;
          return {
            averageRating: Number((sum / count).toFixed(1)),
            totalReviews: count,
            distribution: dist,
          };
        });
        setNewReviewComment("");
        setNewReviewTitle("");
        setIsWritingReview(false);
      } else {
        setReviewMsg({ type: "error", text: data.message || "Failed to submit review." });
      }
    } catch {
      setReviewMsg({ type: "error", text: "Network error submitting review." });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleSubmitNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setIsSubmittingNotify(true);
    setNotifyMsg(null);
    try {
      const res = await fetch(`/api/tenant/${company}/products/${currentVariantId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: notifyEmail,
          phone: notifyPhone,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotifyMsg({ type: "success", text: data.message || "We'll notify you as soon as this item is back in stock!" });
        setNotifyEmail("");
        setNotifyPhone("");
      } else {
        setNotifyMsg({ type: "error", text: data.message || "Failed to subscribe." });
      }
    } catch {
      setNotifyMsg({ type: "error", text: "Network error subscribing for stock notification." });
    } finally {
      setIsSubmittingNotify(false);
    }
  };

  const renderStars = (rating: number, maxStars = 5, sizeClass = "h-4 w-4") => {
    return (
      <div className="flex items-center gap-0.5 text-amber-400">
        {Array.from({ length: maxStars }, (_, i) => {
          const isFilled = i < Math.round(rating);
          return (
            <svg
              key={i}
              className={`${sizeClass} ${isFilled ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}`}
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          );
        })}
      </div>
    );
  };



  const specsList: { key: string; label: string; value: string }[] = [];

  if (product.material && String(product.material).trim()) {
    specsList.push({
      key: "material",
      label: "Material",
      value: String(product.material).trim(),
    });
  }

  const activeFitting = activeVariant?.fitting || (product as any).fitting;
  if (activeFitting && String(activeFitting).trim()) {
    specsList.push({
      key: "fitting",
      label: "Fitting",
      value: String(activeFitting).trim(),
    });
  }

  const activeGender = activeVariant?.gender || (product as any).gender;
  if (activeGender && String(activeGender).trim()) {
    specsList.push({
      key: "gender",
      label: "Gender",
      value: String(activeGender).trim(),
    });
  }

  if (product.length && Number(product.length) > 0) {
    specsList.push({
      key: "length",
      label: "Length",
      value: `${product.length} cm`,
    });
  }

  if (product.weight && Number(product.weight) > 0) {
    specsList.push({
      key: "weight",
      label: "Weight",
      value: `${product.weight} kg`,
    });
  }

  if (product.height && Number(product.height) > 0) {
    specsList.push({
      key: "height",
      label: "Height",
      value: `${product.height} cm`,
    });
  }

  if (product.width && Number(product.width) > 0) {
    specsList.push({
      key: "width",
      label: "Width",
      value: `${product.width} cm`,
    });
  }

  const returnRefundPolicy = footerSettings?.returnRefundPolicy || product.footerSettings?.returnRefundPolicy || "";
  const deliveryNote = footerSettings?.deliveryNote || product.footerSettings?.deliveryNote || "";

  return (
    <div className="py-6 bg-[#FAFAF8] min-h-screen text-gray-900" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">

          {/* Left Column: Image Gallery (Span 7) */}
          <div className="lg:col-span-7 space-y-4">
            <div 
              onClick={() => setIsLightboxOpen(true)}
              className="aspect-[4/3] sm:aspect-[1/1] w-full overflow-hidden rounded-md bg-gray-100 relative group border border-gray-200 shadow-sm cursor-zoom-in"
            >
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrevImage();
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 hover:bg-white text-gray-800 flex items-center justify-center shadow-md transition-transform hover:scale-105 z-10"
                    aria-label="Previous image"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNextImage();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 hover:bg-white text-gray-800 flex items-center justify-center shadow-md transition-transform hover:scale-105 z-10"
                    aria-label="Next image"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}

              {/* Zoom Trigger Button Badge */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLightboxOpen(true);
                }}
                className="absolute bottom-3 right-3 rounded-lg bg-black/60 hover:bg-black/80 text-white px-2.5 py-1.5 backdrop-blur-sm transition-colors flex items-center gap-1.5 text-xs font-medium shadow-sm z-10"
                aria-label="Zoom image"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                </svg>
                <span>Zoom</span>
              </button>

              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                {!isInStock ? (
                  <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-md">
                    Out of Stock
                  </span>
                ) : (
                  <>
                    {isNewArrival && (
                      <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
                        New
                      </span>
                    )}
                    {isOnSale && (
                      <span
                        className="rounded-full px-3 py-1 text-xs font-bold text-white shadow-md"
                        style={{ backgroundColor: theme.primaryColor || "#ef4444" }}
                      >
                        {discountBadgeText || "Sale"}
                      </span>
                    )}
                  </>
                )}
              </div>
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
                      className={`relative h-24 w-20 flex-shrink-0 overflow-hidden rounded-md border-2 transition-all ${isSelected
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
                <div className="flex items-center flex-wrap gap-1 text-xs font-normal text-gray-500">
                  {product.category.includes(">") ? (
                    product.category.split(">").map((seg, idx, arr) => {
                      const trimmedSeg = seg.trim();
                      return (
                        <React.Fragment key={idx}>
                          <button
                            type="button"
                            onClick={() => onSelectCategory?.(trimmedSeg)}
                            className="underline hover:text-gray-800 transition-colors cursor-pointer text-left"
                          >
                            {trimmedSeg}
                          </button>
                          {idx < arr.length - 1 && <span className="text-gray-400">&gt;</span>}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectCategory?.(product.category!)}
                      className="underline hover:text-gray-800 transition-colors cursor-pointer text-left"
                    >
                      {product.category}
                    </button>
                  )}
                </div>
              )}

              {/* Star Rating Snippet */}
              <div className="flex items-center gap-2 pt-1">
                {renderStars(reviewStats.averageRating || 5, 5, "h-3.5 w-3.5")}
                <button
                  type="button"
                  onClick={() => {
                    setAccordionOpen((prev) => ({ ...prev, reviews: true }));
                    const el = document.getElementById("reviews-accordion");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="text-xs text-gray-500 hover:text-gray-900 underline transition-colors cursor-pointer"
                >
                  {reviewStats.totalReviews > 0
                    ? `${reviewStats.averageRating} (${reviewStats.totalReviews} review${reviewStats.totalReviews > 1 ? "s" : ""})`
                    : "Write the first review"}
                </button>
                <span className="text-gray-300">•</span>
                <span className={`text-xs font-medium ${isInStock ? "text-emerald-600" : "text-red-500"}`}>
                  {isInStock ? "In Stock" : "Out of Stock"}
                </span>
              </div>
            </div>

            {/* Price & Share */}
            <div className="flex flex-col border-b border-gray-200 pb-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-2xl sm:text-3xl font-semibold text-gray-900">
                    {formatPrice(currentPrice)}
                  </span>
                  {isOnSale && originalPrice && originalPrice > currentPrice && (
                    <span className="text-base text-gray-400 line-through">
                      {formatPrice(originalPrice)}
                    </span>
                  )}
                  {isNewArrival && (
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      New Arrival
                    </span>
                  )}
                  {isOnSale && (
                    <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                      {discountBadgeText || "SALE"}
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

              {isOnSale && savingsAmount > 0 && (
                <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <span>You save: {formatPrice(savingsAmount)}</span>
                </div>
              )}
            </div>

            {/* Promotional Badge Banner (Stitching badge from reference) 
            <div className="flex items-center gap-3 p-2 border border-emerald-200 bg-emerald-50/50 rounded-md w-fit cursor-pointer hover:bg-emerald-50 transition-colors">
              <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold text-xs flex-shrink-0">
                🪡
              </div>
              <div className="text-xs">
                <span className="font-semibold text-gray-800 block">Click here for STITCHING</span>
                <span className="text-gray-500 text-[11px]">Custom tailoring available for blouse & saree</span>
              </div>
            </div>*/}

            {/* Dynamic Variant Selectors (Color / Size) */}
            {distinctColors.length > 1 ? (
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
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-all ${isSelected
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
            ) : (
              distinctColors.length === 1 && (
                <div className="space-y-1">
                  <span className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Color: <span className="text-gray-950 font-medium normal-case ml-1">{distinctColors[0]}</span>
                  </span>
                </div>
              )
            )}

            {distinctSizes.length > 1 ? (
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
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-all ${isSelected
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
            ) : (
              distinctSizes.length === 1 && (
                <div className="space-y-1">
                  <span className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Size: <span className="text-gray-950 font-medium normal-case ml-1">{distinctSizes[0]}</span>
                  </span>
                </div>
              )
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

            {/* Add to Cart & Wishlist Buttons */}
            <div className="flex items-center gap-3">
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
                className={`flex-1 py-3.5 px-6 font-semibold uppercase tracking-wider text-sm transition-all shadow-sm rounded-xl ${isInStock
                  ? "bg-black text-white hover:bg-gray-800 active:scale-[0.99]"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
              >
                {isInStock ? "ADD TO CART" : "OUT OF STOCK"}
              </button>

              <button
                type="button"
                onClick={handleToggleWishlist}
                className={`p-3.5 rounded-xl border transition-all flex items-center justify-center cursor-pointer ${
                  isWishlisted
                    ? "bg-red-50 border-red-200 text-red-500 shadow-sm"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-900 hover:text-red-500"
                }`}
                title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                aria-label="Wishlist"
              >
                <svg
                  className={`h-5 w-5 ${isWishlisted ? "fill-red-500 text-red-500" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>

            {/* Out-of-Stock: Back-in-Stock Notification Alert */}
            {!isInStock && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Notify Me When Available</h3>
                    <p className="text-xs text-gray-600 mt-0.5">
                      This item is currently out of stock. Leave your contact details and we&apos;ll notify you the moment it&apos;s restocked!
                    </p>
                  </div>
                </div>

                {notifyMsg ? (
                  <div className={`p-3 rounded-xl text-xs font-medium ${notifyMsg.type === "success" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                    {notifyMsg.text}
                  </div>
                ) : (
                  <form onSubmit={handleSubmitNotify} className="space-y-2 pt-1">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="email"
                        required
                        placeholder="Your email address *"
                        value={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.value)}
                        className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                      />
                      <input
                        type="tel"
                        placeholder="Mobile (optional)"
                        value={notifyPhone}
                        onChange={(e) => setNotifyPhone(e.target.value)}
                        className="sm:w-36 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmittingNotify}
                      className="w-full rounded-xl py-2.5 px-4 text-xs font-bold text-white shadow-sm transition-all hover:opacity-95 disabled:opacity-50 cursor-pointer"
                      style={{ backgroundColor: theme.primaryColor || "#000" }}
                    >
                      {isSubmittingNotify ? "Subscribing..." : "Alert Me When Back In Stock"}
                    </button>
                  </form>
                )}
              </div>
            )}

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
                  specsList.length > 0 ? (
                    <div className="mt-3 border border-gray-200 rounded-md overflow-hidden bg-white">
                      <table className="min-w-full divide-y divide-gray-100 text-xs">
                        <tbody className="divide-y divide-gray-100">
                          {specsList.map((spec, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="px-4 py-2 font-medium text-gray-500 w-1/3 bg-gray-50/40 border-r border-gray-100">
                                {spec.label}
                              </td>
                              <td className="px-4 py-2 text-gray-900 font-semibold">
                                {spec.value}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-gray-500 italic">No specifications available for this product.</p>
                  )
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
                    {/* <p className="italic text-gray-400">Note: Slight colour variation of product images due to digital photography or settings on your device</p> */}
                  </div>
                )}
              </div>

              {/* Accordion 3: Returns & Delivery */}
              <div className="border-b border-gray-200 pb-3">
                <button
                  type="button"
                  onClick={() => toggleAccordion("delivery")}
                  className="w-full flex items-center justify-between py-1 text-left text-sm font-semibold text-gray-800 hover:text-gray-900"
                >
                  <span>Delivery & Returns</span>
                  <span className="text-gray-500 text-base">{accordionOpen.delivery ? "▲" : "▼"}</span>
                </button>

                {accordionOpen.delivery && (
                  <div className="mt-3 space-y-3.5 text-xs text-gray-600 leading-relaxed">
                    {(deliveryNote || footerSettings?.deliveryNote || product.footerSettings?.deliveryNote) && (
                      <div>
                        <span className="font-bold text-gray-800 uppercase block tracking-wider">Delivery Information:</span>
                        <p className="mt-1 text-gray-600 whitespace-pre-line">
                          {deliveryNote || footerSettings?.deliveryNote || product.footerSettings?.deliveryNote || "Standard delivery: 5 to 7 business days from date of order."}
                        </p>
                      </div>
                    )}

                    {(returnRefundPolicy || footerSettings?.returnRefundPolicy || product.footerSettings?.returnRefundPolicy) && (
                      <div className="pt-2 border-t border-gray-100">
                        <span className="font-bold text-gray-800 uppercase block tracking-wider mt-1">Returns & Refund Policy:</span>
                        <p className="mt-1 text-gray-600 whitespace-pre-line">
                          {returnRefundPolicy || footerSettings?.returnRefundPolicy || product.footerSettings?.returnRefundPolicy || "Standard return/refund policy applies."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Accordion 4: Customer Reviews & Ratings */}
              <div id="reviews-accordion" className="border-b border-gray-200 pb-3">
                <button
                  type="button"
                  onClick={() => toggleAccordion("reviews")}
                  className="w-full flex items-center justify-between py-1 text-left text-sm font-semibold text-gray-800 hover:text-gray-900"
                >
                  <span className="flex items-center gap-2">
                    <span>Customer Reviews</span>
                    <span className="text-xs font-normal text-gray-500">
                      ({reviewStats.totalReviews})
                    </span>
                  </span>
                  <span className="text-gray-500 text-base">{accordionOpen.reviews ? "▲" : "▼"}</span>
                </button>

                {accordionOpen.reviews && (
                  <div className="mt-4 space-y-5">
                    {/* Overall Score & Distribution */}
                    <div className="rounded-xl bg-gray-50 p-4 flex flex-col sm:flex-row items-center gap-6 border border-gray-100">
                      <div className="text-center sm:text-left shrink-0">
                        <div className="text-4xl font-extrabold text-gray-900 leading-none">
                          {reviewStats.averageRating || "5.0"}
                        </div>
                        <div className="mt-1 flex justify-center sm:justify-start">
                          {renderStars(reviewStats.averageRating || 5, 5, "h-4 w-4")}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Based on {reviewStats.totalReviews} review{reviewStats.totalReviews === 1 ? "" : "s"}
                        </div>
                      </div>

                      {/* Star Bars */}
                      <div className="flex-1 w-full space-y-1.5">
                        {[5, 4, 3, 2, 1].map((star) => {
                          const count = reviewStats.distribution[star] || 0;
                          const percent = reviewStats.totalReviews > 0 ? (count / reviewStats.totalReviews) * 100 : 0;
                          return (
                            <div key={star} className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="w-7 font-medium shrink-0">{star} ★</span>
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${percent}%`,
                                    backgroundColor: theme.primaryColor || "#f59e0b",
                                  }}
                                />
                              </div>
                              <span className="w-6 text-right text-gray-400 shrink-0">{count}</span>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsWritingReview(!isWritingReview)}
                        className="px-4 py-2.5 rounded-xl border border-gray-900 bg-white text-gray-900 text-xs font-bold hover:bg-gray-900 hover:text-white transition-all shadow-sm shrink-0 cursor-pointer"
                      >
                        {isWritingReview ? "Cancel Review" : "Write a Review"}
                      </button>
                    </div>

                    {/* Write Review Form */}
                    {isWritingReview && (
                      <form onSubmit={handleSubmitReview} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-xs">
                        <h4 className="text-sm font-bold text-gray-900">Share Your Experience</h4>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Your Rating *</label>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setNewRating(star)}
                                className="p-1 hover:scale-110 transition-transform cursor-pointer"
                                aria-label={`${star} star`}
                              >
                                <svg
                                  className={`h-6 w-6 ${star <= newRating ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}`}
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              </button>
                            ))}
                            <span className="text-xs font-bold text-gray-700 ml-2">{newRating} of 5 Stars</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Your Name *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Priya S."
                              value={newAuthorName}
                              onChange={(e) => setNewAuthorName(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Review Title</label>
                            <input
                              type="text"
                              placeholder="e.g. Gorgeous fabric, fits perfectly!"
                              value={newReviewTitle}
                              onChange={(e) => setNewReviewTitle(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Your Review *</label>
                          <textarea
                            rows={3}
                            required
                            placeholder="Tell us what you liked about the material, quality, or fit..."
                            value={newReviewComment}
                            onChange={(e) => setNewReviewComment(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-black"
                          />
                        </div>

                        {reviewMsg && (
                          <div className={`p-2.5 rounded-lg text-xs font-medium ${reviewMsg.type === "success" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                            {reviewMsg.text}
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsWritingReview(false)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmittingReview}
                            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 cursor-pointer"
                            style={{ backgroundColor: theme.primaryColor || "#000" }}
                          >
                            {isSubmittingReview ? "Submitting..." : "Submit Review"}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Review List */}
                    {reviews.length === 0 ? (
                      <div className="py-6 text-center text-xs text-gray-400 italic">
                        No reviews yet. Be the first to share your thoughts on this product!
                      </div>
                    ) : (
                      <div className="space-y-3.5 divide-y divide-gray-100">
                        {reviews.map((rev) => (
                          <div key={rev.id} className="pt-3.5 first:pt-0 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-900">{rev.customerName}</span>
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  ✓ Verified Buyer
                                </span>
                              </div>
                              <span className="text-[11px] text-gray-400">
                                {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString() : "Recent"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {renderStars(rev.rating, 5, "h-3 w-3")}
                              {rev.title && <span className="text-xs font-semibold text-gray-800">{rev.title}</span>}
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{rev.comment}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

        {/* Related Products Section ("You May Also Like") */}
        {relatedProducts.length > 0 && (
          <div className="mt-16 pt-10 border-t border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                  You May Also Like
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Hand-picked styles complementing this collection
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(company ? `/${company}/store/products` : "/store/products")}
                className="text-xs font-bold text-gray-900 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View Full Catalog</span>
                <span>→</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {relatedProducts.map((rel) => (
                <div
                  key={rel.variantId}
                  onClick={() => router.push(company ? `/${company}/store/products/${rel.variantId}` : `/store/products/${rel.variantId}`)}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="aspect-square w-full overflow-hidden bg-gray-50 relative">
                    <img
                      src={rel.images[0] || "https://via.placeholder.com/400"}
                      alt={rel.name}
                      className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                    />
                    {rel.isOnSale && (
                      <span className="absolute top-2 left-2 rounded-full bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 shadow-xs">
                        Sale
                      </span>
                    )}
                    {!rel.inStock && (
                      <span className="absolute top-2 right-2 rounded-full bg-black/75 text-white text-[10px] font-bold px-2 py-0.5">
                        Out of Stock
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex flex-col justify-between flex-1">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block truncate">
                        {rel.category}
                      </span>
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors mt-0.5">
                        {rel.name}
                      </h3>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-xs sm:text-sm font-bold text-gray-900">
                        {formatPrice(rel.effectivePrice)}
                      </span>
                      {rel.isOnSale && rel.originalPrice && rel.originalPrice > rel.effectivePrice && (
                        <span className="text-[10px] text-gray-400 line-through">
                          {formatPrice(rel.originalPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* High-Performance Fullscreen Lightbox & Pan-Zoom Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between select-none p-4 md:p-6 transition-opacity animate-fadeIn"
          onClick={() => setIsLightboxOpen(false)}
        >
          {/* Top Bar: Image Counter & Close Button */}
          <div className="w-full flex items-center justify-between z-50 text-white">
            <div className="text-xs sm:text-sm font-medium tracking-wide bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
              Image {uniqueImages.indexOf(selectedImage) + 1} of {uniqueImages.length}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
              aria-label="Close modal"
              title="Close (Esc)"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal Main Content Workspace */}
          <div
            className="w-full flex-1 flex flex-col md:flex-row items-center justify-center gap-4 my-2 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Vertical Thumbnail Strip (Desktop) */}
            {uniqueImages.length > 1 && (
              <div className="hidden md:flex flex-col gap-3 max-h-[75vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 flex-shrink-0 z-20">
                {uniqueImages.map((img: string, idx: number) => {
                  const isSelected = selectedImage === img;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedImage(img)}
                      style={{ width: "64px", height: "80px", minWidth: "64px", minHeight: "80px" }}
                      className={`relative flex-none flex-shrink-0 overflow-hidden rounded-md border-2 transition-all cursor-pointer ${
                        isSelected
                          ? "border-white ring-2 ring-white/50 opacity-100 scale-105"
                          : "border-white/20 hover:border-white/60 opacity-60 hover:opacity-90"
                      }`}
                    >
                      <img src={img} alt={`Thumbnail ${idx + 1}`} className="h-full w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Center Canvas with GPU-Accelerated Cursor Follow Pan-Zoom */}
            <div
              className="relative flex-1 h-full max-h-[80vh] w-full flex items-center justify-center overflow-hidden cursor-crosshair group rounded-lg"
              onMouseEnter={() => setIsHoveringZoom(true)}
              onMouseLeave={() => setIsHoveringZoom(false)}
              onMouseMove={handleMouseMoveZoom}
            >
              {/* Prev Navigation Arrow */}
              {uniqueImages.length > 1 && (
                <button
                  type="button"
                  onClick={handlePrevImage}
                  className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 h-12 w-12 rounded-full bg-black/60 border border-white/20 hover:bg-black/90 text-white flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 cursor-pointer"
                  aria-label="Previous image"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              {/* Main Image View */}
              <div className="h-full w-full flex items-center justify-center overflow-hidden">
                <img
                  src={selectedImage}
                  alt={product.name}
                  className="max-h-full max-w-full object-contain transition-transform duration-150 ease-out select-none pointer-events-auto rounded"
                  style={{
                    transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                    transform: isHoveringZoom ? "scale(2.2)" : "scale(1)",
                  }}
                />
              </div>

              {/* Next Navigation Arrow */}
              {uniqueImages.length > 1 && (
                <button
                  type="button"
                  onClick={handleNextImage}
                  className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 h-12 w-12 rounded-full bg-black/60 border border-white/20 hover:bg-black/90 text-white flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 cursor-pointer"
                  aria-label="Next image"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Bottom Horizontal Thumbnails (Mobile) */}
          {uniqueImages.length > 1 && (
            <div
              className="md:hidden flex gap-2 overflow-x-auto max-w-full pb-1 scrollbar-none z-20"
              onClick={(e) => e.stopPropagation()}
            >
              {uniqueImages.map((img: string, idx: number) => {
                const isSelected = selectedImage === img;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImage(img)}
                    style={{ width: "48px", height: "56px", minWidth: "48px", minHeight: "56px" }}
                    className={`relative flex-none flex-shrink-0 overflow-hidden rounded border-2 transition-all cursor-pointer ${
                      isSelected ? "border-white ring-1 ring-white opacity-100" : "border-white/20 opacity-60"
                    }`}
                  >
                    <img src={img} alt={`Thumbnail ${idx + 1}`} className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
