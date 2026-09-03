"use client";

import React from "react";
import { ShopByCategorySection as ShopByCategorySectionType, StorefrontTheme, CategoryType } from "../types";

interface ShopByCategorySectionProps {
  section: ShopByCategorySectionType;
  theme: StorefrontTheme;
  categories: CategoryType[];
  imagesById?: Record<number, string>;
  onSelectCategory?: (slug: string) => void;
  isPreview?: boolean;
}

export const ShopByCategoryHomeSection: React.FC<ShopByCategorySectionProps> = ({
  section,
  theme,
  categories = [],
  imagesById = {},
  onSelectCategory,
  isPreview = false,
}) => {
  const categoryIdSet = new Set((section.categoryIds || []).map(Number));

  // Match configured category IDs with available category data
  const displayedCategories = categories.filter((c) => categoryIdSet.has(Number(c.id)));

  if (displayedCategories.length === 0) {
    if (isPreview) {
      return (
        <section className="py-8 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl m-4 bg-gray-50">
          <p className="text-sm font-medium text-gray-400">
            Shop by Category: No categories selected or matching
          </p>
        </section>
      );
    }
    return null;
  }

  const sectionTitle = section.title || "Shop by Category";
  const sectionSubtitle = section.subtitle || "Explore our top collections and categories";

  return (
    <section className="py-12 sm:py-16 bg-white" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            {sectionTitle}
          </h2>
          {sectionSubtitle && (
            <p className="mt-2 text-sm sm:text-base text-gray-500">{sectionSubtitle}</p>
          )}
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 sm:gap-6">
          {displayedCategories.map((cat) => {
            const catId = Number(cat.id);
            const override = section.overrides?.[catId];
            const overrideImage = (override?.imageId && imagesById[override.imageId]) || override?.imageUrl;
            const finalImage =
              overrideImage ||
              cat.image ||
              "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&auto=format&fit=crop&q=80";
            const finalLabel = override?.label || cat.name;

            return (
              <div
                key={catId}
                onClick={() => onSelectCategory && onSelectCategory(cat.slug || cat.name)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer"
              >
                <div className="aspect-square w-full overflow-hidden bg-gray-200">
                  <img
                    src={finalImage}
                    alt={finalLabel}
                    className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
                  />
                </div>
                <div className="p-4 text-center">
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                    {finalLabel}
                  </h3>
                  {cat.itemCount != null && cat.itemCount > 0 && (
                    <span className="text-xs text-gray-500 mt-0.5 block">
                      {cat.itemCount} {cat.itemCount === 1 ? "Product" : "Products"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ShopByCategoryHomeSection;
