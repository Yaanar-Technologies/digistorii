import { pool } from "./db";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export function getEffectiveStockConfig(variant: any, businessSettings: any) {
  return {
    lowStockThreshold: variant.low_stock_threshold !== null && variant.low_stock_threshold !== undefined
      ? Number(variant.low_stock_threshold)
      : Number(businessSettings.default_low_stock_threshold ?? 5),
    backordersAllowed: variant.backorders_allowed !== null && variant.backorders_allowed !== undefined
      ? Boolean(variant.backorders_allowed)
      : Boolean(businessSettings.default_backorders_allowed ?? false),
  };
}

export async function checkLowStockAndNotify(
  client: any,
  schema: string,
  tenantId: string,
  variantId: number
) {
  try {
    // 1. Get current stock
    const stockRes = await client.query(
      `SELECT COALESCE(SUM(qty_in) - SUM(qty_out), 0) AS current_stock
       FROM "${schema}".stock_ledger
       WHERE tenant_id = $1 AND product_id = $2`,
      [tenantId, variantId]
    );
    const currentStock = Number(stockRes.rows[0]?.current_stock || 0);

    // 2. Get variant and product info
    const variantRes = await client.query(
      `SELECT pv.*, p.name AS product_name 
       FROM "${schema}".product_variants pv
       JOIN "${schema}".products p ON p.id = pv.product_id
       WHERE pv.id = $1`,
      [variantId]
    );
    const variant = variantRes.rows[0];
    if (!variant) return;

    // 3. Get business settings
    const bsRes = await client.query(
      `SELECT * FROM "${schema}".business_settings LIMIT 1`
    );
    const businessSettings = bsRes.rows[0] || {};

    const effective = getEffectiveStockConfig(variant, businessSettings);

    // 4. Check low stock condition
    if (currentStock <= effective.lowStockThreshold) {
      // Debounce: check if notified in the last 24h
      if (variant.last_low_stock_notified_at) {
        const lastNotified = new Date(variant.last_low_stock_notified_at).getTime();
        const now = Date.now();
        if (now - lastNotified < 24 * 60 * 60 * 1000) {
          // Less than 24 hours, skip notification
          return;
        }
      }

      // If low stock notifications are enabled
      if (businessSettings.low_stock_notifications_enabled ?? true) {
        // Find subscribers
        const subsRes = await client.query(
          `SELECT ns.user_id, u.email, u.name
           FROM "${schema}".notification_subscriptions ns
           JOIN public.users u ON u.id = ns.user_id
           WHERE ns.event_type = 'low_stock' AND ns.enabled = true`
        );
        const subscribers = subsRes.rows;

        if (subscribers.length > 0) {
          const title = "Low Stock Alert";
          const message = `The stock for variant ${variant.sku} (${variant.product_name}) is at ${currentStock}, which is below the threshold of ${effective.lowStockThreshold}.`;
          const metadata = JSON.stringify({
            variant_id: variantId,
            product_id: variant.product_id,
            sku: variant.sku,
            current_qty: currentStock,
            threshold: effective.lowStockThreshold
          });

          // Insert Notification Event
          const notifRes = await client.query(
            `INSERT INTO "${schema}".notifications (type, title, message, metadata, created_at)
             VALUES ('low_stock', $1, $2, $3, NOW())
             RETURNING id, created_at`,
            [title, message, metadata]
          );
          const notificationId = notifRes.rows[0].id;
          const createdAt = notifRes.rows[0].created_at;

          // Insert Notification Recipients and Trigger Real-time Sockets
          const io = (global as any).io;
          for (const sub of subscribers) {
            await client.query(
              `INSERT INTO "${schema}".notification_recipients (notification_id, user_id, is_read, created_at)
               VALUES ($1, $2, false, NOW())
               ON CONFLICT (notification_id, user_id) DO NOTHING`,
              [notificationId, sub.user_id]
            );

            // Send real-time event via socket
            if (io) {
              io.to(`user:${sub.user_id}`).emit("notification:new", {
                id: notificationId,
                type: "low_stock",
                title,
                message,
                metadata: JSON.parse(metadata),
                created_at: createdAt
              });
            }

            // Send Email if enabled
            if (businessSettings.low_stock_email_notifications_enabled && sub.email) {
              const mailOptions = {
                from: process.env.SMTP_FROM || '"Digistorii Alert" <no-reply@digistorii.com>',
                to: sub.email,
                subject: `Low Stock Alert: ${variant.product_name} (${variant.sku})`,
                text: `${message}\n\nPlease update stock at your earliest convenience.`,
                html: `<p>${message}</p><p>Please update stock at your earliest convenience.</p>`
              };
              transporter.sendMail(mailOptions).catch(err => {
                console.error("Failed to send low stock alert email to:", sub.email, err);
              });
            }
          }

          // Update last low stock notified timestamp
          await client.query(
            `UPDATE "${schema}".product_variants
             SET last_low_stock_notified_at = NOW()
             WHERE id = $1`,
            [variantId]
          );
        }
      }
    } else {
      // If stock goes back above threshold, clear the notification debounce tracker
      if (variant.last_low_stock_notified_at !== null) {
        await client.query(
          `UPDATE "${schema}".product_variants
           SET last_low_stock_notified_at = NULL
           WHERE id = $1`,
          [variantId]
        );
      }
    }
  } catch (error) {
    console.error("Error in checkLowStockAndNotify hook:", error);
  }
}
