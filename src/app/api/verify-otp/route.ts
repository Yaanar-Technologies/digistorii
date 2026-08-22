import { createHash } from "crypto";
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
    const otp = String(body?.otp || "").trim();

    if (!Number.isInteger(companyId) || companyId <= 0 || !otp) {
      return NextResponse.json({ success: false, message: "Company and OTP are required" }, { status: 400 });
    }

    await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE`);

    const otpResult = await client.query(
      `SELECT id, user_id, otp_hash, expires_at, attempts
       FROM public.onboarding_otps
       WHERE company_id = $1 AND verified_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [companyId]
    );
    if (!otpResult.rowCount) {
      return NextResponse.json({ success: false, message: "OTP expired. Please resend OTP." }, { status: 400 });
    }

    const row = otpResult.rows[0];
    if (Number(row.attempts || 0) >= 5) {
      return NextResponse.json({ success: false, message: "Invalid OTP attempt limit reached" }, { status: 429 });
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ success: false, message: "Expired OTP" }, { status: 400 });
    }

    if (row.otp_hash !== hashOtp(otp)) {
      await client.query(`UPDATE public.onboarding_otps SET attempts = attempts + 1 WHERE id = $1`, [
        Number(row.id),
      ]);
      return NextResponse.json({ success: false, message: "Invalid OTP" }, { status: 400 });
    }

    await client.query("BEGIN");
    await client.query(
      `UPDATE public.onboarding_otps
       SET verified_at = NOW()
       WHERE id = $1`,
      [Number(row.id)]
    );
    await client.query(
      `UPDATE public.users
       SET phone_verified = TRUE
       WHERE id = $1 AND company_id = $2`,
      [Number(row.user_id), companyId]
    );
    await client.query("COMMIT");

    return NextResponse.json({ success: true, phone_verified: true });
  } catch (error: any) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failures when no transaction is active
    }
    return NextResponse.json(
      { success: false, message: error.message || "Unable to verify OTP" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
