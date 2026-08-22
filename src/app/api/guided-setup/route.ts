import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    const { company } = await req.json();

    if (!company) {
      return NextResponse.json(
        { success: false, message: "Company is required" },
        { status: 400 }
      );
    }

    // Set setup as completed in the database
    await pool.query(
      `UPDATE public.companies SET has_completed_guided_setup = TRUE WHERE subdomain_url = $1`,
      [company]
    );

    return NextResponse.json({ success: true, message: "Setup completed" });
  } catch (error) {
    console.error("Failed to complete guided setup", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}