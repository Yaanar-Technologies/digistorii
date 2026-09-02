export type StorefrontTheme = {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  bannerImages: string[];
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
