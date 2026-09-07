"use client";

import React from "react";
import { OffersSection as OffersSectionType, StorefrontTheme, TenantOffer } from "../types";
import { TagIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { formatPrice } from "@/lib/currency";

interface OffersSectionProps {
  section: OffersSectionType;
  theme: StorefrontTheme;
  offers: TenantOffer[];
  imagesById?: Record<number, string>;
  onExploreOffers?: () => void;
  isPreview?: boolean;
}

export const OffersHomeSection: React.FC<OffersSectionProps> = ({
  section,
  theme,
  offers = [],
  imagesById = {},
  onExploreOffers,
  isPreview = false,
}) => {
  const discountIdSet = new Set((section.discountIds || []).map(Number));

  // Find active matching offers
  const activeMatchingOffers = offers.filter(
    (o) => discountIdSet.has(o.id) && o.isActive
  );

  if (activeMatchingOffers.length === 0) {
    if (isPreview) {
      return (
        <section className="py-8 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl m-4 bg-gray-50">
          <p className="text-sm font-medium text-gray-400">
            Special Offers: No active discounts match selected offers
          </p>
        </section>
      );
    }
    return null;
  }

  const sectionTitle = section.title || "Limited Time Offers & Deals";
  const sectionSubtitle =
    section.subtitle || "Save big on your favorite items with exclusive store discounts";

  const bannerImageUrl =
    (section.bannerImageId && imagesById[section.bannerImageId]) || section.bannerImageUrl;

  return (
    <section className="py-12 sm:py-16 bg-white" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Banner Graphic (if configured) */}
        {bannerImageUrl && (
          <div className="mb-10 overflow-hidden rounded-3xl shadow-lg border border-gray-100">
            <img
              src={bannerImageUrl}
              alt={sectionTitle}
              className="w-full max-h-[280px] object-cover object-center"
            />
          </div>
        )}

        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold uppercase tracking-wider mb-2">
            <SparklesIcon className="h-3.5 w-3.5" />
            Special Deals
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            {sectionTitle}
          </h2>
          {sectionSubtitle && (
            <p className="mt-2 text-sm sm:text-base text-gray-500">{sectionSubtitle}</p>
          )}
        </div>

        {/* Live Offers Cards Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {activeMatchingOffers.map((offer) => {
            const formattedValue =
              offer.discountType === "percentage"
                ? `${offer.discountValue}% OFF`
                : `${formatPrice(offer.discountValue)} OFF`;

            return (
              <div
                key={offer.id}
                className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-gray-100 bg-gradient-to-br from-gray-50 via-white to-gray-50 p-6 shadow-sm hover:shadow-md transition-all duration-200"
              >
                {/* Accent Top Bar */}
                <div
                  className="absolute top-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: theme.primaryColor || "#2563eb" }}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-bold text-white shadow-xs"
                      style={{ backgroundColor: theme.secondaryColor || "#dc2626" }}
                    >
                      <TagIcon className="h-3.5 w-3.5" />
                      {formattedValue}
                    </span>
                    {offer.couponCode && (
                      <span className="font-mono text-xs font-semibold bg-gray-100 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-lg">
                        {offer.couponCode}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 leading-snug">{offer.title}</h3>

                  {offer.description && (
                    <p className="text-sm text-gray-600 line-clamp-3 font-normal leading-relaxed">
                      {offer.description}
                    </p>
                  )}
                </div>

                {offer.endsAt && (
                  <div className="mt-5 pt-3 border-t border-gray-100 text-xs text-gray-400">
                    Expires: {new Date(offer.endsAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default OffersHomeSection;
