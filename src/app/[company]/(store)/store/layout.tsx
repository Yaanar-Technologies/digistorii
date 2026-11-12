import React from "react";
import { Metadata } from "next";
import { pool } from "@/lib/db";
import { generateStorefrontJsonLd } from "@/lib/seo";

interface StoreLayoutProps {
  children: React.ReactNode;
  params: Promise<{ company: string }>;
}

async function getStoreSeoData(companySlug: string) {
  const client = await pool.connect();
  try {
    const compRes = await client.query(
      `SELECT c.id, c.schema_name, c.company_name, c.custom_domain
       FROM public.companies c
       WHERE LOWER(c.subdomain_url) = LOWER($1)
       LIMIT 1`,
      [companySlug]
    );

    if (!compRes.rowCount) return null;

    const { id: companyId, schema_name: schema, company_name, custom_domain } = compRes.rows[0];

    const themeRes = await client.query(
      `SELECT published_theme
       FROM "${schema}".storefront_config
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    const settingsRes = await client.query(
      `SELECT support_email, support_phone
       FROM "${schema}".ecom_settings
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    const publishedTheme = themeRes.rows[0]?.published_theme || {};
    const settings = settingsRes.rows[0] || {};

    return {
      storeName: company_name || companySlug,
      companySlug,
      customDomain: custom_domain,
      logoUrl: publishedTheme.logo_url || "",
      heroTitle: publishedTheme.hero_title || `Welcome to ${company_name || companySlug}`,
      heroSubtitle: publishedTheme.hero_subtitle || "Shop quality curated products at best prices with fast, reliable delivery.",
      supportEmail: settings.support_email || "",
      supportPhone: settings.support_phone || "",
    };
  } catch (err) {
    console.error("Failed to load store SEO data:", err);
    return null;
  } finally {
    client.release();
  }
}

export async function generateMetadata({ params }: { params: Promise<{ company: string }> }): Promise<Metadata> {
  const { company } = await params;
  const seoData = await getStoreSeoData(company);

  if (!seoData) {
    return {
      title: "Storefront",
      description: "Online Storefront",
    };
  }

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const defaultStoreUrl = appBase ? `${appBase}/${company}` : `/${company}`;
  const storeUrl = seoData.customDomain ? `https://${seoData.customDomain}` : defaultStoreUrl;

  return {
    title: {
      default: `${seoData.storeName} | Official Online Store`,
      template: `%s | ${seoData.storeName}`,
    },
    description: seoData.heroSubtitle,
    keywords: [
      seoData.storeName,
      "online store",
      "shopping",
      "e-commerce",
      "exclusive collection",
      "order online",
    ],
    openGraph: {
      title: `${seoData.storeName} | Official Online Store`,
      description: seoData.heroSubtitle,
      url: storeUrl,
      siteName: seoData.storeName,
      images: seoData.logoUrl ? [{ url: seoData.logoUrl }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${seoData.storeName} | Official Online Store`,
      description: seoData.heroSubtitle,
      images: seoData.logoUrl ? [seoData.logoUrl] : [],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function StoreLayout({ children, params }: StoreLayoutProps) {
  const { company } = await params;
  const seoData = await getStoreSeoData(company);

  const jsonLd = seoData
    ? generateStorefrontJsonLd({
        storeName: seoData.storeName,
        storeUrl: seoData.customDomain
          ? `https://${seoData.customDomain}`
          : process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/${company}`
            : `/${company}`,
        logoUrl: seoData.logoUrl,
        description: seoData.heroSubtitle,
        supportEmail: seoData.supportEmail,
        supportPhone: seoData.supportPhone,
      })
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
