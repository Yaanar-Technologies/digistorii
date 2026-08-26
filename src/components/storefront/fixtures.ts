import { StorefrontTheme, StorefrontProduct, CategoryType, FooterSettings, CartItemType } from "./types";

export const mockTheme: StorefrontTheme = {
  primaryColor: "#2563eb",
  secondaryColor: "#1d4ed8",
  logoUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
  bannerImages: [
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1200&auto=format&fit=crop&q=80",
  ],
  fontFamily: "Inter, sans-serif",
  heroTitle: "Discover Modern Lifestyle & Fashion",
  heroDescription: "Handpicked premium essentials for your daily style and living.",
  socialLinks: {
    facebook: "https://facebook.com",
    instagram: "https://instagram.com",
    whatsapp: "https://wa.me/1234567890",
  },
};

export const mockCategories: CategoryType[] = [
  { id: "cat-1", name: "Apparel", slug: "apparel", image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&auto=format&fit=crop&q=80", itemCount: 12 },
  { id: "cat-2", name: "Footwear", slug: "footwear", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=80", itemCount: 8 },
  { id: "cat-3", name: "Accessories", slug: "accessories", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&auto=format&fit=crop&q=80", itemCount: 15 },
  { id: "cat-4", name: "Electronics", slug: "electronics", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80", itemCount: 6 },
];

export const mockProducts: StorefrontProduct[] = [
  {
    variantId: 101,
    name: "Classic Organic Cotton T-Shirt",
    images: [
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&auto=format&fit=crop&q=80",
    ],
    effectivePrice: 29.99,
    compareAtPrice: 39.99,
    inStock: true,
    sortOrder: 1,
    category: "Apparel",
    description: "Ultra-soft 100% organic cotton t-shirt crafted for everyday comfort and durability.",
    options: [
      { name: "Size", values: ["S", "M", "L", "XL"] },
      { name: "Color", values: ["White", "Navy", "Black"] },
    ],
  },
  {
    variantId: 102,
    name: "Minimalist Leather Watch",
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
    ],
    effectivePrice: 129.00,
    compareAtPrice: 159.00,
    inStock: true,
    sortOrder: 2,
    category: "Accessories",
    description: "Sleek analog timepiece with genuine Italian leather strap and scratch-resistant sapphire glass.",
    options: [
      { name: "Strap Color", values: ["Tan Brown", "Matte Black"] },
    ],
  },
  {
    variantId: 103,
    name: "Wireless Noise-Canceling Headphones",
    images: [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80",
    ],
    effectivePrice: 199.99,
    compareAtPrice: 249.99,
    inStock: false, // Explicitly out of stock for testing stock rules
    sortOrder: 3,
    category: "Electronics",
    description: "Immersive high-fidelity audio with active noise cancellation and up to 30 hours of battery life.",
    options: [
      { name: "Color", values: ["Silver", "Space Gray"] },
    ],
  },
  {
    variantId: 104,
    name: "Urban Performance Running Shoes",
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80",
    ],
    effectivePrice: 89.50,
    compareAtPrice: 110.00,
    inStock: true,
    sortOrder: 4,
    category: "Footwear",
    description: "Lightweight cushioned running shoes designed for maximum impact absorption and agility.",
    options: [
      { name: "Size", values: ["8", "9", "10", "11"] },
    ],
  },
];

export const mockFooterSettings: FooterSettings = {
  termsAndConditions: "Standard tenant Terms & Conditions apply. All content and products are property of the merchant.",
  returnRefundPolicy: "30-day hassle-free returns on all unworn and unopened merchandise.",
  supportEmail: "support@storefront-demo.com",
  supportPhone: "+1 (800) 555-0199",
};

export const mockCartItems: CartItemType[] = [
  {
    variantId: 101,
    productName: "Classic Organic Cotton T-Shirt",
    image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80",
    price: 29.99,
    compareAtPrice: 39.99,
    quantity: 2,
    selectedOptions: { Size: "M", Color: "Navy" },
    inStock: true,
  },
  {
    variantId: 102,
    productName: "Minimalist Leather Watch",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
    price: 129.00,
    compareAtPrice: 159.00,
    quantity: 1,
    selectedOptions: { "Strap Color": "Tan Brown" },
    inStock: true,
  },
];
