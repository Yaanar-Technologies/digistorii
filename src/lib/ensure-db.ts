// src/lib/ensure-db.ts
import { initializeDatabase } from "./init-db";
import { startBillingCron } from "./cron";

// Store the active promise globally across HMR/reloads
let initPromise: Promise<void> | null = null;

export async function ensureDB() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      console.log("Checking DB initialization...");
      await initializeDatabase();
      startBillingCron();
      console.log("DB ready");
    } catch (err) {
      // Reset so a subsequent request can retry if it fails
      initPromise = null;
      console.error("DB initialization failed:", err);
      throw err;
    }
  })();

  return initPromise;
}