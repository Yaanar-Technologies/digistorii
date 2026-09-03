"use client";

import React from "react";
import { ShopByColorSection as ShopByColorSectionType, StorefrontTheme, TenantColor } from "../types";

interface ShopByColorSectionProps {
  section: ShopByColorSectionType;
  theme: StorefrontTheme;
  colors: TenantColor[];
  imagesById?: Record<number, string>;
  onSelectColor?: (colorId: number, colorName: string) => void;
  isPreview?: boolean;
}

export const ShopByColorHomeSection: React.FC<ShopByColorSectionProps> = ({
  section,
  theme,
  colors = [],
  imagesById = {},
  onSelectColor,
  isPreview = false,
}) => {
  const items = section.items || [];
  const colorMap = new Map(colors.map((c) => [c.id, c]));

  if (items.length === 0) {
    if (isPreview) {
      return (
        <section className="py-8 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl m-4 bg-gray-50">
          <p className="text-sm font-medium text-gray-400">Shop by Color: No color items configured</p>
        </section>
      );
    }
    return null;
  }

  const sectionTitle = section.title || "Shop by Color";
  const sectionSubtitle = section.subtitle || "Find your favorite style in the perfect shade";

  return (
    <section className="py-12 sm:py-16 bg-gray-50/60" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            {sectionTitle}
          </h2>
          {sectionSubtitle && (
            <p className="mt-2 text-sm sm:text-base text-gray-500">{sectionSubtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 sm:gap-6">
          {items.map((item) => {
            const colorData = colorMap.get(item.colorId);
            const colorName = item.label || colorData?.name || `Color #${item.colorId}`;
            const hexCode = colorData?.hexCode || "#e2e8f0";
            const imageUrl = (item.imageId && imagesById[item.imageId]) || item.imageUrl;

            return (
              <div
                key={item.id || item.colorId}
                onClick={() => onSelectColor && onSelectColor(item.colorId, colorName)}
                className="group flex flex-col items-center p-4 rounded-2xl bg-white border border-gray-100 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 cursor-pointer text-center"
              >
                {imageUrl ? (
                  <div className="h-20 w-20 rounded-full overflow-hidden mb-3 border-2 border-gray-100 shadow-xs">
                    <img
                      src={imageUrl}
                      alt={colorName}
                      className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div
                    className="h-16 w-16 rounded-full mb-3 shadow-inner border border-black/10 group-hover:scale-110 transition-transform duration-300 flex items-center justify-center"
                    style={{ backgroundColor: hexCode }}
                  />
                )}
                <span className="font-semibold text-sm text-gray-800 group-hover:text-brand-600 transition-colors">
                  {colorName}
                </span>
                {hexCode && (
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider mt-0.5">
                    {hexCode}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ShopByColorHomeSection;
