"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  StorefrontTheme,
  mockTheme,
  StorefrontThemeProvider,
} from "@/components/storefront";
import { getGoogleFontUrl } from "@/lib/font-utils";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const company = (params.company as string) || "";

  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<StorefrontTheme>(mockTheme);

  useEffect(() => {
    if (!company) {
      setLoading(false);
      return;
    }

    const fetchPublicTheme = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/storefront/${company}/theme`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.published_theme) {
            const pub = data.published_theme;
            setTheme({
              primaryColor: pub.primary_color || "#2563eb",
              secondaryColor: pub.secondary_color || "#1e40af",
              logoUrl: pub.logo_url || "",
              logoImageId: pub.logo_image_id,
              bannerImages: pub.hero_banner_url ? [pub.hero_banner_url] : mockTheme.bannerImages,
              bannerImageId: pub.hero_banner_image_id,
              fontFamily: pub.font_family || "Inter",
              layoutVariant: pub.layout_variant || "standard",
              heroTitle: pub.hero_title || "Welcome to Our Storefront",
              heroDescription: pub.hero_subtitle || "Explore our exclusive high-quality product collection.",
              socialLinks: {
                facebook: pub.social_facebook,
                instagram: pub.social_instagram,
                whatsapp: pub.social_whatsapp,
              },
              featuredCategoryIds: pub.featured_category_ids || [],
              navItems: pub.nav_items || [],
              homeSections: pub.home_sections || [],
            });
          } else {
            // Graceful fallback to mockTheme if no published theme exists yet
            setTheme(mockTheme);
          }
        } else {
          setTheme(mockTheme);
        }
      } catch (err) {
        console.error("Failed to load storefront theme, falling back to mockTheme:", err);
        setTheme(mockTheme);
      } finally {
        setLoading(false);
      }
    };

    fetchPublicTheme();
  }, [company]);

  useEffect(() => {
    // Add Google Fonts preconnect tags if not present
    if (!document.getElementById("google-fonts-preconnect")) {
      const p1 = document.createElement("link");
      p1.rel = "preconnect";
      p1.href = "https://fonts.googleapis.com";
      document.head.appendChild(p1);

      const p2 = document.createElement("link");
      p2.id = "google-fonts-preconnect";
      p2.rel = "preconnect";
      p2.href = "https://fonts.gstatic.com";
      p2.crossOrigin = "anonymous";
      document.head.appendChild(p2);
    }

    const fontUrl = getGoogleFontUrl(theme.fontFamily);
    if (!fontUrl) return;

    let link = document.getElementById("storefront-public-google-font") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.id = "storefront-public-google-font";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = fontUrl;
  }, [theme.fontFamily]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 bg-gray-50">
        Loading storefront...
      </div>
    );
  }

  return (
    <StorefrontThemeProvider theme={theme}>
      {children}
    </StorefrontThemeProvider>
  );
}
