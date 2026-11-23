import cron from "node-cron";
import { pool } from "./db";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail(to: string, subject: string, text: string) {
  try {
    if (!process.env.SMTP_USER) {
      console.warn("SMTP credentials not configured, skipping email delivery to:", to);
      return;
    }
    await transporter.sendMail({
      from: `"System Administrator" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    });
    console.log(`Email sent successfully to ${to} with subject: ${subject}`);
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
  }
}

let cronStarted = false;

export function startBillingCron() {
  if (cronStarted) return;
  cronStarted = true;

  console.log("Initializing weekly Sunday 12:00 AM billing cron job...");

  // Runs every Sunday at 00:00 (0 0 * * 0)
  cron.schedule("0 0 * * 0", async () => {
    console.log("Running weekly billing cron sync...");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Sync Expired Statuses (Only after the 3-day grace period has passed)
      // Sync companies table status
      await client.query(`
        UPDATE public.companies 
        SET status = 'EXPIRED' 
        WHERE id IN (
          SELECT company_id 
          FROM public.company_subscriptions 
          WHERE COALESCE(grace_period_end_date, subscription_end + INTERVAL '3 days') < NOW()
        )
      `);

      // Sync company_subscriptions status
      await client.query(`
        UPDATE public.company_subscriptions
        SET status = 'expired'
        WHERE COALESCE(grace_period_end_date, subscription_end + INTERVAL '3 days') < NOW()
      `);

      await client.query("COMMIT");
      console.log("Expired subscription statuses synced successfully (accounting for 3-day grace period).");

      // 2. Query & Send 7-Day Warning Email
      const warningResult = await client.query(`
        SELECT c.email, c.company_name as name, cs.subscription_end, cs.grace_period_end_date
        FROM public.companies c
        JOIN public.company_subscriptions cs ON cs.company_id = c.id
        WHERE cs.subscription_end::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
          AND c.status = 'LIVE'
      `);

      for (const row of warningResult.rows) {
        if (row.email) {
          const subject = "Your Subscription Expires Soon - Action Required";
          const text = `Dear Admin,\n\nYour subscription for company "${row.name}" is set to expire on ${new Date(row.subscription_end).toLocaleDateString()}. Please renew it to prevent service interruption.\n\nBest Regards,\nSystem Administrator`;
          await sendMail(row.email, subject, text);
        }
      }

      // 3. Query & Send Grace Period Notice (Subscription Expired, in 3-day grace period)
      const graceResult = await client.query(`
        SELECT c.email, c.company_name as name, cs.subscription_end, 
               COALESCE(cs.grace_period_end_date, cs.subscription_end + INTERVAL '3 days') as grace_end
        FROM public.companies c
        JOIN public.company_subscriptions cs ON cs.company_id = c.id
        WHERE cs.subscription_end <= NOW()
          AND NOW() <= COALESCE(cs.grace_period_end_date, cs.subscription_end + INTERVAL '3 days')
          AND c.status != 'EXPIRED'
      `);

      for (const row of graceResult.rows) {
        if (row.email) {
          const graceDate = new Date(row.grace_end).toLocaleDateString();
          const subject = "Subscription Expired: 3-Day Grace Period Active";
          const text = `Dear Admin,\n\nYour subscription for company "${row.name}" expired on ${new Date(row.subscription_end).toLocaleDateString()}.\n\nYou are currently in a 3-day grace period ending on ${graceDate}. All operations remain active during this window. Please renew immediately to avoid complete service suspension after ${graceDate}.\n\nBest Regards,\nSystem Administrator`;
          await sendMail(row.email, subject, text);
        }
      }

      // 4. Query & Send Hard Cutoff / Expired Email (After grace period)
      const expiredResult = await client.query(`
        SELECT c.email, c.company_name as name, cs.subscription_end,
               COALESCE(cs.grace_period_end_date, cs.subscription_end + INTERVAL '3 days') as grace_end
        FROM public.companies c
        JOIN public.company_subscriptions cs ON cs.company_id = c.id
        WHERE COALESCE(cs.grace_period_end_date, cs.subscription_end + INTERVAL '3 days') < NOW()
          AND c.status = 'EXPIRED'
      `);

      for (const row of expiredResult.rows) {
        if (row.email) {
          const subject = "Your Subscription Has Expired - Access Suspended";
          const text = `Dear Admin,\n\nYour subscription and 3-day grace period for company "${row.name}" have ended. Access to the system has been restricted. Please renew the subscription to restore access.\n\nBest Regards,\nSystem Administrator`;
          await sendMail(row.email, subject, text);
        }
      }

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error in billing cron job execution:", err);
    } finally {
      client.release();
    }
  });
}
