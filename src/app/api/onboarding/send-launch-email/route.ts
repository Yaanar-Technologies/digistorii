import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
//import { ensureDB } from "@/lib/ensure-db";
import nodemailer from "nodemailer";
import { randomBytes } from "crypto";
// ──────────────────────────────────────────────────────────────
//  DUMMY CREDENTIALS — Replace with your real sender email
//  and app password before going to production.
// ──────────────────────────────────────────────────────────────
// const SENDER_EMAIL = process.env.LAUNCH_SENDER_EMAIL || "ytsample98@gmail.com";
// const SENDER_PASSWORD = process.env.LAUNCH_SENDER_PASSWORD || "ozjf cupa vukc edsp";

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: SENDER_EMAIL,
//     pass: SENDER_PASSWORD,
//   },
// });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(req: NextRequest) {
  //await ensureDB();
  const client = await pool.connect();

  try {
    const cryptoToken = randomBytes(32).toString("hex");
    const body = await req.json();
    const company = String(body?.company || "").trim().toLowerCase();
    if (!company) {
      return NextResponse.json(
        { success: false, message: "Company is required" },
        { status: 400 }
      );
    }

    // Fetch company details
    const companyResult = await client.query(
      `SELECT id, company_name, subdomain_url, schema_name
       FROM public.companies
       WHERE subdomain_url = $1
       LIMIT 1`,
      [company]
    );
    if (!companyResult.rowCount) {
      return NextResponse.json(
        { success: false, message: "Company not found" },
        { status: 404 }
      );
    }

    const companyRow = companyResult.rows[0];
    const companyId = Number(companyRow.id);

    // Fetch owner user
    const ownerResult = await client.query(
      `SELECT id, name, email, phone
       FROM public.users
       WHERE company_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [companyId]
    );
    if (!ownerResult.rowCount) {
      return NextResponse.json(
        { success: false, message: "Owner user not found" },
        { status: 404 }
      );
    }

    const owner = ownerResult.rows[0];
    const ownerEmail = String(owner.email || "").trim();
    if (!ownerEmail) {
      return NextResponse.json(
        { success: false, message: "Owner email is missing" },
        { status: 400 }
      );
    }

    await client.query(
      `UPDATE public.companies
       SET verification_token = $1, updated_at = NOW()
       WHERE id = $2`,
      [cryptoToken, companyId]
    );

    // Fetch subscription info
    const subResult = await client.query(
      `SELECT plan_code, max_users, max_locations, max_warehouses, ecommerce_access, billing_interval, amount
       FROM public.company_subscriptions
       WHERE company_id = $1
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [companyId]
    );
    const sub = subResult.rows[0] || null;

    const adminUrl = `digistorii/${company}/admin`;
    const shopUrl = `digistorii/${company}/workspace`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "/not_found";
    const secureverificationLink = `${baseUrl}/api/verify-company?token=${cryptoToken}`;
    // Build email HTML
    const htmlBody = `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 32px 16px;">
    
    <!-- Header Block -->
    <div style="background-color: #2563eb; background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); border-radius: 16px; padding: 32px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0 0 8px 0; font-size: 26px; font-weight: 700; color: #ffffff;">Welcome to DigiStorii</h1>
      <p style="margin: 0; opacity: 0.9; font-size: 15px; color: #ffffff;">Your workspace is almost ready</p>
    </div>

    <!-- Account Details Block -->
    <div style="background-color: #ffffff; border-radius: 16px; padding: 28px; margin-top: 20px; border: 1px solid #e2e8f0;">
      <h2 style="margin: 0 0 16px 0; color: #1e293b; font-size: 18px;">Your Account Details</h2>
      
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Company</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; font-size: 14px; text-align: right;">${companyRow.company_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Owner Email</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; font-size: 14px; text-align: right;">${ownerEmail}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Plan</td>
          <td style="padding: 8px 0; color: #1e293b; font-weight: 600; font-size: 14px; text-align: right;">${sub?.plan_code || "N/A"} (${sub?.billing_interval || "monthly"})</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Admin Console</td>
          <td style="padding: 8px 0; font-size: 14px; text-align: right;"><a href="https://${adminUrl}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${adminUrl}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Operations Portal</td>
          <td style="padding: 8px 0; font-size: 14px; text-align: right;"><a href="https://${shopUrl}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${shopUrl}</a></td>
        </tr>
      </table>
    </div>

    <!-- Plan Features Block (Converted from Flexbox to Table) -->
    <div style="background-color: #ffffff; border-radius: 16px; padding: 28px; margin-top: 16px; border: 1px solid #e2e8f0;">
      <h2 style="margin: 0 0 16px 0; color: #1e293b; font-size: 18px;">Plan Features</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td width="32%" style="background-color: #f1f5f9; border-radius: 12px; padding: 16px; text-align: center;">
            <p style="margin: 0; font-size: 22px; font-weight: 700; color: #2563eb;">${sub?.max_users ?? 5}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Users</p>
          </td>
          <td width="2%">&nbsp;</td> <!-- Spacer -->
          <td width="32%" style="background-color: #f1f5f9; border-radius: 12px; padding: 16px; text-align: center;">
            <p style="margin: 0; font-size: 22px; font-weight: 700; color: #2563eb;">${sub?.max_locations ?? 1}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Locations</p>
          </td>
          <td width="2%">&nbsp;</td> <!-- Spacer -->
          <td width="32%" style="background-color: #f1f5f9; border-radius: 12px; padding: 16px; text-align: center;">
            <p style="margin: 0; font-size: 22px; font-weight: 700; color: #2563eb;">${sub?.max_warehouses ?? 1}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Warehouses</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Outlook-Safe Call to Action Button -->
    <div style="text-align: center; margin: 32px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${secureverificationLink}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="15%" stroke="f" fillcolor="#2563eb">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">Verify & Activate Workspace</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${secureverificationLink}" target="_blank" style="background-color: #2563eb; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; padding: 14px 28px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
        Verify & Activate Workspace
      </a>
      <!--<![endif]-->
    </div>

  </div>
`;

    // Send the email
    await transporter.sendMail({
      from: `"DigiStorii" <${process.env.SMTP_USER}>`,
      to: ownerEmail,
      subject: ` Welcome to DigiStorii — Your workspace "${companyRow.company_name}" is ready!`,
      html: htmlBody,
    });



    return NextResponse.json({
      success: true,
      message: "Activation email sent successfully. Your workspace is now live!",
      email: ownerEmail,
    });
  } catch (error: any) {
    console.error("send-launch-email error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Unable to send activation email" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
