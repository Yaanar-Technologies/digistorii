import nodemailer from "nodemailer";

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return cachedTransporter;
}

export interface SendStorefrontEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  storeName?: string;
  replyTo?: string;
}

export async function sendStorefrontEmail({
  to,
  subject,
  html,
  text,
  storeName = "DigiStorii Store",
  replyTo,
}: SendStorefrontEmailParams): Promise<boolean> {
  try {
    if (!process.env.SMTP_USER) {
      console.warn("SMTP_USER not configured. Simulating email send to:", to, "Subject:", subject);
      return true;
    }

    const transporter = getTransporter();
    const cleanStoreName = storeName.replace(/["\r\n]/g, "").trim() || "DigiStorii Store";
    const fromAddress = `"${cleanStoreName}" <${process.env.SMTP_USER}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, " "),
      html,
      replyTo: replyTo && replyTo.includes("@") ? replyTo : undefined,
    });

    console.log(`Email dispatched successfully to ${to}. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    return false;
  }
}
