import nodemailer from "nodemailer";
import { randomInt } from "crypto";

const ADMIN_EMAIL = "cmyezwa@okiru.co.za";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export function generateOtp(length?: number): string {
  const len = length || parseInt(process.env.OTP_LENGTH || "6", 10);
  let otp = "";
  for (let i = 0; i < len; i++) {
    otp += randomInt(0, 10).toString();
  }
  return otp;
}

export function getOtpExpiryMinutes(): number {
  return parseInt(process.env.OTP_EXPIRY_MINUTES || "5", 10);
}

export function getMaxOtpAttempts(): number {
  return parseInt(process.env.MAX_OTP_ATTEMPTS || "5", 10);
}

export async function sendOtpEmail(toEmail: string, otpCode: string, userName?: string | null) {
  const t = getTransporter();
  if (!t) {
    console.log(`[email] SMTP not configured — skipping OTP email for ${toEmail}`);
    return false;
  }

  const displayName = userName || toEmail;
  const expiryMinutes = getOtpExpiryMinutes();

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `${otpCode} — Your Okiru Verification Code`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #ffffff; text-align: center;">
            <h2 style="margin: 0 0 8px; font-size: 16px; color: #818cf8; font-weight: 600;">Verification Code</h2>
            <p style="margin: 0 0 24px; font-size: 13px; color: #9ca3af;">Hi ${displayName}, use the code below to verify your identity.</p>
            <div style="background: #2d2d4a; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #818cf8; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">${otpCode}</span>
            </div>
            <p style="margin: 0 0 4px; font-size: 12px; color: #9ca3af;">This code expires in <strong style="color: #ffffff;">${expiryMinutes} minutes</strong>.</p>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">If you didn't request this code, please ignore this email.</p>
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #2d2d4a;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">Sent by Okiru — B-BBEE Compliance Platform</p>
            </div>
          </div>
        </div>
      `,
    });
    console.log(`[email] OTP sent to ${toEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[email] Failed to send OTP:`, err.message);
    return false;
  }
}

export async function sendLoginNotification(userEmail: string, fullName: string | null, orgName: string | null) {
  const t = getTransporter();
  if (!t) {
    console.log(`[email] SMTP not configured — skipping login notification for ${userEmail}`);
    return;
  }

  const displayName = fullName || userEmail;
  const org = orgName || "Unknown Organization";
  const loginTime = new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: ADMIN_EMAIL,
      subject: `Staff Login — ${displayName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="background: #1a1a2e; border-radius: 12px; padding: 24px; color: #ffffff;">
            <h2 style="margin: 0 0 16px; font-size: 18px; color: #818cf8;">Staff Login Notification</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Name</td>
                <td style="padding: 8px 0; color: #ffffff; font-size: 13px; font-weight: 600;">${displayName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Email</td>
                <td style="padding: 8px 0; color: #ffffff; font-size: 13px;">${userEmail}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Organization</td>
                <td style="padding: 8px 0; color: #ffffff; font-size: 13px;">${org}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Login Time</td>
                <td style="padding: 8px 0; color: #ffffff; font-size: 13px;">${loginTime}</td>
              </tr>
            </table>
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #2d2d4a;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">Sent by Okiru Pro — B-BBEE Compliance Platform</p>
            </div>
          </div>
        </div>
      `,
    });
    console.log(`[email] Login notification sent for ${userEmail}`);
  } catch (err: any) {
    console.error(`[email] Failed to send login notification:`, err.message);
  }
}
