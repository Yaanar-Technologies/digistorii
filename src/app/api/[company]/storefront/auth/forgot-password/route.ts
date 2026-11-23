import { createHash, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCustomerSchema, validateEmail } from "@/lib/customerAuth";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { sendStorefrontEmail } from "@/lib/emailService";

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();
  try {
    const { company } = await params;
    const companySlug = (company || "").trim().toLowerCase();
    const body = await req.json().catch(() => ({}));
    const rawEmail = String(body?.email || body?.identifier || "").trim().toLowerCase();

    if (!companySlug || !rawEmail) {
      return NextResponse.json(
        { success: false, message: "Registered email address is required" },
        { status: 400 }
      );
    }

    if (!validateEmail(rawEmail)) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid email address" },
        { status: 400 }
      );
    }

    const { schema } = await getTenantSchemaByCompany(companySlug);
    await ensureCustomerSchema(client, schema);

    // Fetch tenant store info for email branding
    const companyRes = await client.query(
      `SELECT c.company_name, 
      es.support_email as email,
      es.support_phone as phone 
      FROM public.companies c 
      LEFT join "${schema}".ecom_settings es on c.id = es.company_id
      WHERE LOWER(c.subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );
    const companyInfo = companyRes.rows[0] || {};
    const storeName = companyInfo.company_name || companySlug;
    const storeEmail = companyInfo.email || undefined;

    // Rate limiting: check recent OTPs in last 60 seconds
    const recentOtps = await client.query(
      `SELECT id FROM "${schema}".customer_otps
       WHERE email = $1 AND created_at > NOW() - INTERVAL '60 seconds'`,
      [rawEmail]
    );

    if (recentOtps.rowCount && recentOtps.rowCount >= 2) {
      return NextResponse.json(
        { success: false, message: "Please wait 60 seconds before requesting another code." },
        { status: 429 }
      );
    }

    const custRes = await client.query(
      `SELECT id, email, name, cust_name FROM "${schema}".customers
       WHERE LOWER(email) = $1 AND (is_deleted IS NOT TRUE)
       LIMIT 1`,
      [rawEmail]
    );

    if (!custRes.rowCount) {
      // Return generic feedback to protect user privacy
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a 6-digit verification code has been dispatched.",
      });
    }

    const customer = custRes.rows[0];
    const customerName = customer.name || customer.cust_name || "Valued Customer";

    // Generate 6-digit numeric OTP with 10-minute expiry
    const otpCode = String(randomInt(100000, 999999));
    const hashed = hashOtp(otpCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in customer_otps table
    await client.query(
      `INSERT INTO "${schema}".customer_otps (email, otp_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [rawEmail, hashed, expiresAt]
    );

    // Also update reset token on customer record for redundancy
    await client.query(
      `UPDATE "${schema}".customers
       SET reset_password_token = $1, reset_password_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [hashed, expiresAt, customer.id]
    );

    const emailSubject = `${otpCode} is your Password Reset Code for ${storeName}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Password Reset Code</h2>
        <p style="color: #475569; font-size: 14px;">Hello ${customerName},</p>
        <p style="color: #475569; font-size: 14px;">We received a request to reset the password for your account at <strong>${storeName}</strong>. Use the 6-digit code below to set a new password:</p>
        
        <div style="text-align: center; margin: 28px 0;">
          <span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 12px 24px; background-color: #f1f5f9; color: #1e293b; border-radius: 8px; border: 1px dashed #cbd5e1;">
            ${otpCode}
          </span>
        </div>

        <p style="color: #64748b; font-size: 12px; margin-bottom: 4px;">This code will expire in <strong>10 minutes</strong>. If you did not request this password reset, please ignore this email or reach out to support.</p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">Sent by ${storeName} via DigiStorii Commerce</p>
      </div>
    `;

    await sendStorefrontEmail({
      to: rawEmail,
      subject: emailSubject,
      html: emailHtml,
      storeName,
      replyTo: storeEmail,
    });

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been dispatched to ${rawEmail}.`,
      demoOtp: process.env.NODE_ENV !== "production" ? otpCode : undefined,
    });
  } catch (err: any) {
    console.error("Forgot password OTP error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to process password reset request" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
