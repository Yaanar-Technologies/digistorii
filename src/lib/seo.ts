/**
 * SEO & Schema.org Structured Data Helper Utilities
 */

export interface StoreJsonLdParams {
  storeName: string;
  storeUrl: string;
  logoUrl?: string;
  description?: string;
  supportEmail?: string;
  supportPhone?: string;
}

export function generateStorefrontJsonLd(params: StoreJsonLdParams) {
  const { storeName, storeUrl, logoUrl, description, supportEmail, supportPhone } = params;

  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: storeName,
    url: storeUrl,
    ...(logoUrl ? { logo: logoUrl, image: logoUrl } : {}),
    ...(description ? { description } : {}),
    ...(supportEmail || supportPhone
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "Customer Support",
            ...(supportEmail ? { email: supportEmail } : {}),
            ...(supportPhone ? { telephone: supportPhone } : {}),
          },
        }
      : {}),
  };
}

export interface ProductJsonLdParams {
  name: string;
  description?: string;
  images?: string[];
  sku?: string;
  price: number;
  currency?: string;
  inStock?: boolean;
  storeName: string;
  productUrl: string;
  category?: string;
}

export function generateProductJsonLd(params: ProductJsonLdParams) {
  const {
    name,
    description,
    images = [],
    sku,
    price,
    currency = "INR",
    inStock = true,
    storeName,
    productUrl,
    category,
  } = params;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(description ? { description } : { description: `${name} available at ${storeName}` }),
    ...(images.length > 0 ? { image: images } : {}),
    ...(sku ? { sku } : {}),
    ...(category ? { category } : {}),
    brand: {
      "@type": "Brand",
      name: storeName,
    },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: currency,
      price: price.toFixed(2),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: storeName,
      },
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function generateBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
