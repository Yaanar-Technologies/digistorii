export type NavItemType =
  | "category"        // categoryId -> product_categories.id
  | "new_arrivals"
  | "offers"
  | "about"
  | "more"             // dropdown of Shop by Color / Shop by Material entries
  | "custom_link";

export type NavCollectionItem =
  | { id: string; kind: "color"; colorId: number; label?: string; imageId?: number; imageUrl?: string }
  | { id: string; kind: "material"; materialId: number; label?: string; imageId?: number; imageUrl?: string };

export type NavItem = {
  id: string;
  type: NavItemType;
  label: string;
  enabled: boolean;
  order: number;
  categoryId?: number;
  customUrl?: string;
  collections?: NavCollectionItem[];
};

export type HomeSectionType =
  | "hero_carousel"
  | "shop_by_category"
  | "shop_by_color"
  | "shop_by_material"
  | "product_carousel"
  | "offers"
  | "about";

export type HeroSlide = {
  id: string;
  imageId?: number;
  imageUrl?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
};

export type HeroCarouselSection = {
  id: string;
  type: "hero_carousel";
  enabled: boolean;
  order: number;
  slides: HeroSlide[];
};

export type ShopByCategorySection = {
  id: string;
  type: "shop_by_category";
  title?: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
  categoryIds: number[];
  overrides?: Record<number, { imageId?: number; imageUrl?: string; label?: string }>;
};

export type ShopByColorItem = {
  id: string;
  colorId: number;
  imageId?: number;
  imageUrl?: string;
  label?: string;
};

export type ShopByColorSection = {
  id: string;
  type: "shop_by_color";
  title?: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
  items: ShopByColorItem[];
};

export type ShopByMaterialItem = {
  id: string;
  materialId: number;
  imageId?: number;
  imageUrl?: string;
  label?: string;
};

export type ShopByMaterialSection = {
  id: string;
  type: "shop_by_material";
  title?: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
  items: ShopByMaterialItem[];
};

export type ProductCarouselSection = {
  id: string;
  type: "product_carousel";
  title?: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
  category?: string;
  limit?: number;
};

export type OffersSection = {
  id: string;
  type: "offers";
  title?: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
  discountIds: number[];
  bannerImageId?: number;
  bannerImageUrl?: string;
};

export type AboutBlock = {
  id: string;
  heading?: string;
  body?: string;
  imageId?: number;
  imageUrl?: string;
  imagePosition?: "left" | "right";
};

export type AboutSection = {
  id: string;
  type: "about";
  title?: string;
  subtitle?: string;
  enabled: boolean;
  order: number;
  blocks: AboutBlock[];
};

export type HomeSection =
  | HeroCarouselSection
  | ShopByCategorySection
  | ShopByColorSection
  | ShopByMaterialSection
  | ProductCarouselSection
  | OffersSection
  | AboutSection;

export type TenantOffer = {
  id: number;
  title: string;
  description?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  couponCode?: string | null;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  scope?: "specific_products" | "storewide";
};

export type TenantColor = {
  id: number;
  name: string;
  hexCode?: string;
};

export type TenantMaterial = {
  id: number;
  name: string;
  code?: string;
};

export type ResolvedImage = {
  id: number;
  filename?: string;
  filePath?: string;
  url: string;
};

export type StorefrontTheme = {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  logoImageId?: number;
  bannerImages: string[];
  bannerImageId?: number;
  fontFamily: string;
  layoutVariant?: string;
  heroTitle?: string;
  heroDescription?: string;
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    whatsapp?: string;
  };
  featuredCategoryIds?: number[];
  navItems?: NavItem[];
  homeSections?: HomeSection[];
};

export type ProductSpecification = {
  label: string;
  value: string;
};

export type SiblingVariant = {
  variantId: number;
  sku: string;
  color?: string | null;
  colorHex?: string | null;
  size?: string | null;
  gender?: string | null;
  fitting?: string | null;
  originalPrice?: number;
  effectivePrice: number;
  compareAtPrice?: number;
  isOnSale?: boolean;
  discountValue?: number;
  discountType?: "percentage" | "fixed";
  discountBadgeText?: string;
  savingsAmount?: number;
  availableQty: number;
  lowStockThreshold: number;
  inStock: boolean;
  images: string[];
};

export type StorefrontProduct = {
  variantId: number;
  productCode?: string;
  name: string;
  images: string[];
  originalPrice?: number;
  effectivePrice: number;     // ecom_price_overrides.ecom_price if active, else product_pricing.final_selling_price or discounted price
  compareAtPrice?: number;
  isOnSale?: boolean;
  discountValue?: number;
  discountType?: "percentage" | "fixed";
  discountBadgeText?: string;
  savingsAmount?: number;
  inStock: boolean;           // from ecom_available_stock.available_qty > 0
  availableQty?: number;
  lowStockThreshold?: number;
  sortOrder?: number;
  category?: string;
  description?: string;
  material?: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  specifications?: ProductSpecification[];
  options?: { name: string; values: string[] }[];
  variants?: SiblingVariant[];
  footerSettings?: FooterSettings;
  colorVariants?: { variantId: number; color: string; colorHex?: string; swatchImage?: string }[];
  sizeVariants?: {
    variantId: number;
    size: string;
    originalPrice?: number;
    effectivePrice: number;
    compareAtPrice?: number;
    isOnSale?: boolean;
    discountBadgeText?: string;
    savingsAmount?: number;
    availableQty: number;
    inStock: boolean;
  }[];
};

export type FooterSettings = {
  termsAndConditions?: string;
  returnRefundPolicy?: string;
  deliveryNote?: string;
  supportEmail?: string;
  supportPhone?: string;
};

export type CategoryType = {
  id: number | string;
  name: string;
  slug: string;
  image?: string;
  itemCount?: number;
  level?: number;
  path_string?: string;
};

export type CartItemType = {
  variantId: number;
  productName: string;
  image?: string;
  price: number;
  compareAtPrice?: number;
  quantity: number;
  selectedOptions?: Record<string, string>;
  inStock: boolean;
};

export type WishlistItemType = {
  variantId: number;
  productName: string;
  image?: string;
  price: number;
  compareAtPrice?: number;
  category?: string;
  inStock: boolean;
};
