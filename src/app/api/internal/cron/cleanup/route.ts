import { NextRequest, NextResponse } from "next/server";
import { runAllCleanupTasks } from "@/lib/reservationCleanup";

export async function POST(req: NextRequest) {
  const secretEnv = process.env.CRON_SECRET;
  const cronSecretHeader = req.headers.get("x-cron-secret");

  if (!secretEnv || !cronSecretHeader || cronSecretHeader !== secretEnv) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const results = await runAllCleanupTasks();
    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (err: any) {
    console.error("[CronCleanup] Error executing cleanup route:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute cleanup tasks" },
      { status: 500 }
    );
  }
}
