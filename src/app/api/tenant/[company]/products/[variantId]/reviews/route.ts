import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifySession, CUSTOMER_COOKIE_NAME, CustomerSessionPayload } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; variantId: string }> }
) {
  const { company, variantId: rawVariantId } = await params;
  const companySlug = (company || "").trim().toLowerCase();
  const variantId = Number(rawVariantId || 0);

  if (!companySlug || !variantId || isNaN(variantId)) {
    return NextResponse.json(
      { success: false, message: "Company and valid variantId are required." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const tenantRes = await client.query(
      `SELECT c.id, c.schema_name
       FROM public.companies c
       WHERE LOWER(c.subdomain_url) = $1
       LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const { schema_name: schema } = tenantRes.rows[0];

    // Ensure reviews table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".product_reviews (
        id BIGSERIAL PRIMARY KEY,
        variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES "${schema}".customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(150) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(200),
        comment TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_product_reviews_variant ON "${schema}".product_reviews(variant_id, status);
    `);

    // Fetch approved reviews
    const reviewsRes = await client.query(
      `SELECT id, customer_name, rating, title, comment, created_at
       FROM "${schema}".product_reviews
       WHERE variant_id = $1 AND status = 'approved'
       ORDER BY created_at DESC
       LIMIT 50`,
      [variantId]
    );

    const reviews = reviewsRes.rows.map((r) => ({
      id: Number(r.id),
      customerName: r.customer_name,
      rating: Number(r.rating),
      title: r.title || "",
      comment: r.comment || "",
      createdAt: r.created_at,
    }));

    // Calculate rating stats
    const totalReviews = reviews.length;
    let sumRating = 0;
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const r of reviews) {
      sumRating += r.rating;
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    }

    const averageRating = totalReviews > 0 ? Number((sumRating / totalReviews).toFixed(1)) : 0;

    return NextResponse.json({
      success: true,
      reviews,
      stats: {
        averageRating,
        totalReviews,
        distribution,
      },
    });
  } catch (err: any) {
    console.error("Fetch reviews API error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load product reviews." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; variantId: string }> }
) {
  const { company, variantId: rawVariantId } = await params;
  const companySlug = (company || "").trim().toLowerCase();
  const variantId = Number(rawVariantId || 0);

  if (!companySlug || !variantId || isNaN(variantId)) {
    return NextResponse.json(
      { success: false, message: "Company and valid variantId are required." },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const rating = Number(body.rating);
  const customerName = String(body.customerName || "").trim();
  const title = String(body.title || "").trim();
  const comment = String(body.comment || "").trim();

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json(
      { success: false, message: "Rating must be between 1 and 5." },
      { status: 400 }
    );
  }

  if (!customerName || customerName.length < 2) {
    return NextResponse.json(
      { success: false, message: "Please provide your name (at least 2 characters)." },
      { status: 400 }
    );
  }

  if (!comment || comment.length < 5) {
    return NextResponse.json(
      { success: false, message: "Please write a review comment (at least 5 characters)." },
      { status: 400 }
    );
  }

  // Check logged in customer session
  let customerId: number | null = null;
  const sessionCookie = req.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (sessionCookie) {
    try {
      const session = await verifySession<CustomerSessionPayload>(sessionCookie, "customer");
      if (session?.customerId) {
        customerId = Number(session.customerId);
      }
    } catch {
      // Ignore if guest
    }
  }

  const client = await pool.connect();
  try {
    const tenantRes = await client.query(
      `SELECT c.id, c.schema_name
       FROM public.companies c
       WHERE LOWER(c.subdomain_url) = $1
       LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const { schema_name: schema } = tenantRes.rows[0];

    // Ensure reviews table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".product_reviews (
        id BIGSERIAL PRIMARY KEY,
        variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES "${schema}".customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(150) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(200),
        comment TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_product_reviews_variant ON "${schema}".product_reviews(variant_id, status);
    `);

    // Verify variant exists
    const variantRes = await client.query(
      `SELECT id FROM "${schema}".product_variants WHERE id = $1 LIMIT 1`,
      [variantId]
    );

    if (!variantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: "Product variant not found." },
        { status: 404 }
      );
    }

    // Insert review (approved by default for instant feedback)
    const insertRes = await client.query(
      `INSERT INTO "${schema}".product_reviews (
        variant_id, customer_id, customer_name, rating, title, comment, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'approved', NOW(), NOW())
      RETURNING id, customer_name, rating, title, comment, created_at`,
      [variantId, customerId, customerName, rating, title || null, comment]
    );

    const newReview = insertRes.rows[0];

    return NextResponse.json({
      success: true,
      message: "Thank you! Your review has been published.",
      review: {
        id: Number(newReview.id),
        customerName: newReview.customer_name,
        rating: Number(newReview.rating),
        title: newReview.title || "",
        comment: newReview.comment || "",
        createdAt: newReview.created_at,
      },
    });
  } catch (err: any) {
    console.error("Submit review API error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to submit review." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
