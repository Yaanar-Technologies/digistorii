import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  const host = req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const isCustomDomain = !host.includes("localhost") && !host.includes("digistorii") && !host.includes("platform.com");
  const baseUrl = `${protocol}://${host}`;
  const prefix = isCustomDomain ? "" : `/${companySlug}`;

  const robots = `User-agent: *
Allow: ${prefix}/store
Allow: ${prefix}/policies
Disallow: ${prefix}/admin
Disallow: ${prefix}/workspace
Disallow: ${prefix}/api
Disallow: ${prefix}/checkout
Disallow: ${prefix}/cart

Sitemap: ${baseUrl}${prefix}/sitemap.xml
`;

  return new NextResponse(robots, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
