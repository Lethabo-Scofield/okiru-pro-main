import nodemailer from "nodemailer";

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
            <h2 style="margin: 0 0 16px; font-size: 18px; color: #a78bfa;">Staff Login Notification</h2>
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
