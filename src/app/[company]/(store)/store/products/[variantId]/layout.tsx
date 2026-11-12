import React from "react";
import { Metadata } from "next";
import { pool } from "@/lib/db";
import { generateProductJsonLd } from "@/lib/seo";

interface ProductDetailLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    company: string;
    variantId: string;
  }>;
}

async function getProductSeoData(companySlug: string, variantIdStr: string) {
  const variantId = Number(variantIdStr);
  if (!variantId || isNaN(variantId)) return null;

  const client = await pool.connect();
  try {
    const compRes = await client.query(
      `SELECT id, schema_name, company_name, custom_domain
       FROM public.companies
       WHERE LOWER(subdomain_url) = LOWER($1)
       LIMIT 1`,
      [companySlug]
    );

    if (!compRes.rowCount) return null;

    const { schema_name: schema, company_name, custom_domain } = compRes.rows[0];

    // Find variant and product
    const variantRes = await client.query(
      `SELECT pv.id, pv.sku, pv.product_id, p.name, p.description,
              pcat.category_name,
              COALESCE(
                (SELECT epo.ecom_price FROM "${schema}".ecom_price_overrides epo WHERE epo.variant_id = pv.id AND epo.is_active = TRUE LIMIT 1),
                (SELECT pp.final_selling_price FROM "${schema}".product_pricing pp WHERE pp.variant_id = pv.id AND pp.is_active = TRUE LIMIT 1),
                0.00
              ) AS price,
              COALESCE(
                (SELECT SUM(eas.available_qty) FROM "${schema}".ecom_available_stock eas WHERE eas.variant_id = pv.id),
                pv.qty,
                0
              ) AS stock_qty
       FROM "${schema}".product_variants pv
       JOIN "${schema}".products p ON p.id = pv.product_id
       LEFT JOIN "${schema}".product_categories pcat ON pcat.id = NULLIF(p.category, '')::integer
       WHERE pv.id = $1
       LIMIT 1`,
      [variantId]
    );

    if (!variantRes.rowCount) return null;

    const vRow = variantRes.rows[0];

    // Images
    const imgRes = await client.query(
      `SELECT image_url
       FROM "${schema}".product_images
       WHERE product_id = $1
       ORDER BY is_primary DESC, sort_order ASC, id ASC`,
      [vRow.product_id]
    );

    const images = imgRes.rows.map((r) => r.image_url);

    return {
      storeName: company_name || companySlug,
      companySlug,
      customDomain: custom_domain,
      name: vRow.name,
      description: vRow.description || `${vRow.name} - Available at ${company_name || companySlug}`,
      sku: vRow.sku,
      category: vRow.category_name,
      price: Number(vRow.price || 0),
      inStock: Number(vRow.stock_qty || 0) > 0,
      images,
    };
  } catch (err) {
    console.error("Failed to load product SEO data:", err);
    return null;
  } finally {
    client.release();
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ company: string; variantId: string }>;
}): Promise<Metadata> {
  const { company, variantId } = await params;
  const product = await getProductSeoData(company, variantId);

  if (!product) {
    return {
      title: "Product Details",
      description: "Explore product details and purchasing options.",
    };
  }

  const productUrl = product.customDomain
    ? `https://${product.customDomain}/store/products/${variantId}`
    : `/${company}/store/products/${variantId}`;

  return {
    title: `${product.name} | ${product.storeName}`,
    description: product.description.slice(0, 160),
    openGraph: {
      title: `${product.name} | ${product.storeName}`,
      description: product.description.slice(0, 160),
      url: productUrl,
      siteName: product.storeName,
      images: product.images.length > 0 ? [{ url: product.images[0] }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} | ${product.storeName}`,
      description: product.description.slice(0, 160),
      images: product.images.length > 0 ? [product.images[0]] : [],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function ProductDetailLayout({
  children,
  params,
}: ProductDetailLayoutProps) {
  const { company, variantId } = await params;
  const product = await getProductSeoData(company, variantId);

  const productUrl = product?.customDomain
    ? `https://${product.customDomain}/store/products/${variantId}`
    : `/${company}/store/products/${variantId}`;

  const jsonLd = product
    ? generateProductJsonLd({
        name: product.name,
        description: product.description,
        images: product.images,
        sku: product.sku,
        price: product.price,
        inStock: product.inStock,
        storeName: product.storeName,
        productUrl,
        category: product.category,
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
