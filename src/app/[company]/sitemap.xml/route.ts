import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  if (!companySlug) {
    return new NextResponse("Tenant parameter is missing", { status: 400 });
  }

  const client = await pool.connect();
  try {
    const compRes = await client.query(
      `SELECT id, company_name, schema_name
       FROM public.companies
       WHERE subdomain_url = $1
       LIMIT 1`,
      [companySlug]
    );

    if (compRes.rowCount === 0) {
      return new NextResponse("Store not found", { status: 404 });
    }

    const { schema_name: schema } = compRes.rows[0];

    // Query active and live storefront products
    let productRows: Array<{ id: string | number; updated_at?: string; created_at?: string }> = [];
    try {
      const prodRes = await client.query(
        `SELECT pv.id, pv.updated_at, pv.created_at
         FROM "${schema}".product_variants pv
         INNER JOIN "${schema}".storefront_products sp ON sp.variant_id = pv.id
         WHERE pv.status = 'active' AND sp.is_live = TRUE
         ORDER BY pv.updated_at DESC NULLS LAST, pv.id DESC
         LIMIT 5000`
      );
      productRows = prodRes.rows;
    } catch {
      // If table doesn't exist yet, gracefully continue without product URLs
      productRows = [];
    }

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const isCustomDomain = !host.includes("localhost") && !host.includes("digistorii") && !host.includes("platform.com");
    const baseUrl = `${protocol}://${host}`;
    const prefix = isCustomDomain ? "" : `/${companySlug}`;

    const nowIso = new Date().toISOString().split("T")[0];

    const staticUrls = [
      {
        loc: `${baseUrl}${prefix}/store`,
        lastmod: nowIso,
        changefreq: "daily",
        priority: "1.0",
      },
      {
        loc: `${baseUrl}${prefix}/store/products`,
        lastmod: nowIso,
        changefreq: "daily",
        priority: "0.9",
      },
      {
        loc: `${baseUrl}${prefix}/policies/terms`,
        lastmod: nowIso,
        changefreq: "monthly",
        priority: "0.3",
      },
      {
        loc: `${baseUrl}${prefix}/policies/privacy`,
        lastmod: nowIso,
        changefreq: "monthly",
        priority: "0.3",
      },
      {
        loc: `${baseUrl}${prefix}/policies/returns`,
        lastmod: nowIso,
        changefreq: "monthly",
        priority: "0.3",
      },
    ];

    const productUrls = productRows.map((p) => {
      const rawDate = p.updated_at || p.created_at;
      const lastmod = rawDate ? new Date(rawDate).toISOString().split("T")[0] : nowIso;
      return {
        loc: `${baseUrl}${prefix}/store/products/${p.id}`,
        lastmod,
        changefreq: "weekly",
        priority: "0.8",
      };
    });

    const allUrls = [...staticUrls, ...productUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err: any) {
    console.error("Sitemap generation error:", err);
    return new NextResponse("Internal server error generating sitemap", { status: 500 });
  } finally {
    client.release();
  }
}
