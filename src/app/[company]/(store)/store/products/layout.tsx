import React from "react";
import { Metadata } from "next";
import { pool } from "@/lib/db";

interface ProductsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ company: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ company: string }>;
}): Promise<Metadata> {
  const { company } = await params;
  const client = await pool.connect();
  let storeName = company;

  try {
    const compRes = await client.query(
      `SELECT company_name FROM public.companies WHERE LOWER(subdomain_url) = LOWER($1) LIMIT 1`,
      [company]
    );
    if (compRes.rowCount) {
      storeName = compRes.rows[0].company_name || company;
    }
  } catch (err) {
    console.error("Failed to load store name for products catalog metadata:", err);
  } finally {
    client.release();
  }

  return {
    title: `All Products | ${storeName}`,
    description: `Browse the complete collection of products available at ${storeName}. Filter by categories, colors, materials, and price.`,
    openGraph: {
      title: `All Products | ${storeName}`,
      description: `Browse the complete collection of products available at ${storeName}.`,
    },
  };
}

export default function ProductsLayout({ children }: ProductsLayoutProps) {
  return <>{children}</>;
}
