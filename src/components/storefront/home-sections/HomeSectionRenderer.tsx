"use client";

import React from "react";
import {
  HomeSection,
  StorefrontTheme,
  CategoryType,
  TenantColor,
  TenantMaterial,
  StorefrontProduct,
  TenantOffer,
} from "../types";
import HeroCarouselSection from "./HeroCarouselSection";
import ShopByCategorySection from "./ShopByCategorySection";
import ShopByColorSection from "./ShopByColorSection";
import ShopByMaterialSection from "./ShopByMaterialSection";
import ProductCarouselSection from "./ProductCarouselSection";
import OffersSection from "./OffersSection";
import AboutSection from "./AboutSection";

export interface HomeSectionRendererProps {
  section: HomeSection;
  theme: StorefrontTheme;
  categories?: CategoryType[];
  colors?: TenantColor[];
  materials?: TenantMaterial[];
  products?: StorefrontProduct[];
  offers?: TenantOffer[];
  imagesById?: Record<number, string>;
  onSelectCategory?: (slug: string) => void;
  onSelectColor?: (colorId: number, colorName: string) => void;
  onSelectMaterial?: (materialId: number, materialName: string) => void;
  onProductClick?: (product: StorefrontProduct) => void;
  onAddToCart?: (product: StorefrontProduct) => void;
  onCtaClick?: (link?: string) => void;
  isPreview?: boolean;
}

export const HomeSectionRenderer: React.FC<HomeSectionRendererProps> = ({
  section,
  theme,
  categories = [],
  colors = [],
  materials = [],
  products = [],
  offers = [],
  imagesById = {},
  onSelectCategory,
  onSelectColor,
  onSelectMaterial,
  onProductClick,
  onAddToCart,
  onCtaClick,
  isPreview = false,
}) => {
  if (!section.enabled && !isPreview) {
    return null;
  }

  switch (section.type) {
    case "hero_carousel":
      return (
        <HeroCarouselSection
          section={section}
          theme={theme}
          imagesById={imagesById}
          onCtaClick={onCtaClick}
          isPreview={isPreview}
        />
      );

    case "shop_by_category":
      return (
        <ShopByCategorySection
          section={section}
          theme={theme}
          categories={categories}
          imagesById={imagesById}
          onSelectCategory={onSelectCategory}
          isPreview={isPreview}
        />
      );

    case "shop_by_color":
      return (
        <ShopByColorSection
          section={section}
          theme={theme}
          colors={colors}
          imagesById={imagesById}
          onSelectColor={onSelectColor}
          isPreview={isPreview}
        />
      );

    case "shop_by_material":
      return (
        <ShopByMaterialSection
          section={section}
          theme={theme}
          materials={materials}
          imagesById={imagesById}
          onSelectMaterial={onSelectMaterial}
          isPreview={isPreview}
        />
      );

    case "product_carousel":
      return (
        <ProductCarouselSection
          section={section}
          theme={theme}
          products={products}
          onProductClick={onProductClick}
          onAddToCart={onAddToCart}
          isPreview={isPreview}
        />
      );

    case "offers":
      return (
        <OffersSection
          section={section}
          theme={theme}
          offers={offers}
          imagesById={imagesById}
          isPreview={isPreview}
        />
      );

    case "about":
      return (
        <AboutSection
          section={section}
          theme={theme}
          imagesById={imagesById}
          isPreview={isPreview}
        />
      );

    default:
      return null;
  }
};

export default HomeSectionRenderer;
