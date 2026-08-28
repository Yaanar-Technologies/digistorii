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

export type StorefrontProduct = {
  variantId: number;
  name: string;
  images: string[];
  effectivePrice: number;     // ecom_price_overrides.ecom_price if active, else product_pricing.final_selling_price
  compareAtPrice?: number;
  inStock: boolean;           // from ecom_available_stock.available_qty > 0
  sortOrder: number;
  category?: string;
  description?: string;
  options?: { name: string; values: string[] }[];
};

export type FooterSettings = {
  termsAndConditions?: string;
  returnRefundPolicy?: string;
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
  inStock: boolean;
};
