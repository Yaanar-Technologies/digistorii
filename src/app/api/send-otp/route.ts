import { createHash, randomInt } from "crypto";
import { NextResponse } from "next/server";
//import { ensureDB } from "@/lib/ensure-db";
import { pool } from "@/lib/db";

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

export async function POST(req: Request) {
  //await ensureDB();
  const client = await pool.connect();

  try {
    const body = await req.json();
    const companyId = Number(body?.company_id || 0);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ success: false, message: "Company is required" }, { status: 400 });
    }

    await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.onboarding_otps (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        otp_hash TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        resend_count INTEGER NOT NULL DEFAULT 0,
        verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const userResult = await client.query(
      `SELECT id, phone
       FROM public.users
       WHERE company_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [companyId]
    );
    if (!userResult.rowCount) {
      return NextResponse.json({ success: false, message: "Stored phone number was not found" }, { status: 404 });
    }

    const latest = await client.query(
      `SELECT resend_count, created_at
       FROM public.onboarding_otps
       WHERE company_id = $1 AND verified_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [companyId]
    );
    const resendCount = Number(latest.rows[0]?.resend_count || 0);
    if (resendCount >= 3) {
      return NextResponse.json({ success: false, message: "Resend limit reached" }, { status: 429 });
    }

    const otp = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await client.query(
      `INSERT INTO public.onboarding_otps
       (company_id, user_id, otp_hash, expires_at, resend_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [companyId, Number(userResult.rows[0].id), hashOtp(otp), expiresAt, resendCount + 1]
    );

    return NextResponse.json({
      success: true,
      cooldown_seconds: 45,
      sample_text: `Sample SMS: Your DigiStorii launch OTP is ${otp}.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Unable to send OTP" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
