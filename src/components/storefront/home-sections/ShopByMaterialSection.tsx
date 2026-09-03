"use client";

import React from "react";
import { ShopByMaterialSection as ShopByMaterialSectionType, StorefrontTheme, TenantMaterial } from "../types";

interface ShopByMaterialSectionProps {
  section: ShopByMaterialSectionType;
  theme: StorefrontTheme;
  materials: TenantMaterial[];
  imagesById?: Record<number, string>;
  onSelectMaterial?: (materialId: number, materialName: string) => void;
  isPreview?: boolean;
}

export const ShopByMaterialHomeSection: React.FC<ShopByMaterialSectionProps> = ({
  section,
  theme,
  materials = [],
  imagesById = {},
  onSelectMaterial,
  isPreview = false,
}) => {
  const items = section.items || [];
  const materialMap = new Map(materials.map((m) => [m.id, m]));

  if (items.length === 0) {
    if (isPreview) {
      return (
        <section className="py-8 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl m-4 bg-gray-50">
          <p className="text-sm font-medium text-gray-400">
            Shop by Material: No material items configured
          </p>
        </section>
      );
    }
    return null;
  }

  const sectionTitle = section.title || "Shop by Material";
  const sectionSubtitle = section.subtitle || "Premium fabrics and materials crafted for quality";

  return (
    <section className="py-12 sm:py-16 bg-white" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            {sectionTitle}
          </h2>
          {sectionSubtitle && (
            <p className="mt-2 text-sm sm:text-base text-gray-500">{sectionSubtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-6">
          {items.map((item) => {
            const materialData = materialMap.get(item.materialId);
            const materialName = item.label || materialData?.name || `Material #${item.materialId}`;
            const imageUrl =
              (item.imageId && imagesById[item.imageId]) ||
              item.imageUrl ||
              "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=600&auto=format&fit=crop&q=80";

            return (
              <div
                key={item.id || item.materialId}
                onClick={() => onSelectMaterial && onSelectMaterial(item.materialId, materialName)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/50 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer"
              >
                <div className="aspect-4/3 w-full overflow-hidden bg-gray-200">
                  <img
                    src={imageUrl}
                    alt={materialName}
                    className="h-full w-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <div className="p-4 text-center">
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                    {materialName}
                  </h3>
                  {materialData?.code && (
                    <span className="text-xs text-gray-400 uppercase tracking-wide block mt-0.5">
                      {materialData.code}
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

export default ShopByMaterialHomeSection;
