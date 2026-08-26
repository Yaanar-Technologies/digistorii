"use client";

import React from "react";
import { StorefrontTheme, CategoryType } from "./types";

export interface CategoryGridProps {
  theme: StorefrontTheme;
  categories: CategoryType[];
  onSelectCategory?: (slug: string) => void;
  title?: string;
  subtitle?: string;
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({
  theme,
  categories,
  onSelectCategory,
  title = "Shop by Category",
  subtitle = "Explore our top curated collections",
}) => {
  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <section className="py-12 bg-gray-50/50" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-sm text-gray-600">
              {subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 sm:gap-6">
          {categories.map((category) => (
            <div
              key={category.id}
              onClick={() => onSelectCategory && onSelectCategory(category.slug)}
              className="group relative cursor-pointer overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100 transition-all hover:shadow-md hover:-translate-y-1"
            >
              <div className="aspect-square w-full overflow-hidden bg-gray-100 relative">
                {category.image ? (
                  <img
                    src={category.image}
                    alt={category.name}
                    className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-200 text-gray-400">
                    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
              </div>

              {/* Text Badge at Bottom */}
              <div className="absolute bottom-0 inset-x-0 p-4 text-white">
                <h3 className="text-lg font-bold tracking-wide group-hover:underline">
                  {category.name}
                </h3>
                {category.itemCount !== undefined && (
                  <p className="text-xs text-gray-200 mt-0.5">
                    {category.itemCount} {category.itemCount === 1 ? "Item" : "Items"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryGrid;
