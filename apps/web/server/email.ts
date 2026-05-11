import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import { createLogger } from "./logger";

const logger = createLogger("Email");

const ADMIN_EMAIL = "cmyezwa@okiru.co.za";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.debug("SMTP not configured - email transport unavailable", { host: !!host, user: !!user, pass: !!pass });
    return null;
  }

  logger.info("Initializing SMTP transport", { host, port });
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
    logger.warn("SMTP not configured - skipping OTP email", { to: toEmail });
    return false;
  }

  const displayName = userName || toEmail;
  const expiryMinutes = getOtpExpiryMinutes();
  logger.debug("Sending OTP email", { to: toEmail, expiryMinutes });

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `${otpCode} - Your Okiru Verification Code`,
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
              <p style="margin: 0; font-size: 11px; color: #6b7280;">Sent by Okiru - B-BBEE Compliance Platform</p>
            </div>
          </div>
        </div>
      `,
    });
    logger.info("OTP email sent successfully", { to: toEmail });
    return true;
  } catch (err: any) {
    logger.error("Failed to send OTP email", err, { to: toEmail });
    return false;
  }
}

export async function sendPasswordResetEmail(toEmail: string, resetToken: string, userName?: string | null) {
  const t = getTransporter();
  if (!t) {
    logger.warn("SMTP not configured - skipping password reset email", { to: toEmail });
    return false;
  }
  logger.debug("Sending password reset email", { to: toEmail });

  const displayName = userName || toEmail;
  const resetUrl = `${process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5000'}/auth?mode=reset&token=${resetToken}`;

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `Password Reset - Okiru Pro`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #ffffff; text-align: center;">
            <h2 style="margin: 0 0 8px; font-size: 16px; color: #818cf8; font-weight: 600;">Password Reset</h2>
            <p style="margin: 0 0 24px; font-size: 13px; color: #9ca3af;">Hi ${displayName}, use the code below to reset your password.</p>
            <div style="background: #2d2d4a; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #818cf8; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">${resetToken}</span>
            </div>
            <p style="margin: 0 0 4px; font-size: 12px; color: #9ca3af;">This code expires in <strong style="color: #ffffff;">15 minutes</strong>.</p>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">If you didn't request a password reset, please ignore this email.</p>
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #2d2d4a;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">Sent by Okiru - B-BBEE Compliance Platform</p>
            </div>
          </div>
        </div>
      `,
    });
    logger.info("Password reset email sent", { to: toEmail });
    return true;
  } catch (err: any) {
    logger.error("Failed to send password reset email", err, { to: toEmail });
    return false;
  }
}

export interface WorkspaceInviteEmailContext {
  inviteeEmail: string;
  inviterName: string;
  inviterEmail: string | null;
  inviterCompany: string | null;
  workspaceName: string;
  role: "owner" | "collaborator" | "viewer";
  acceptUrl: string;
  expiresAt: Date | string;
}

const ROLE_COPY: Record<string, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full access — can manage people and settings." },
  collaborator: { label: "Editor", description: "Can view and edit team work." },
  viewer: { label: "Viewer", description: "Can view everything but can't make changes." },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildWorkspaceInviteEmail(ctx: WorkspaceInviteEmailContext): {
  subject: string;
  html: string;
  text: string;
  fromName: string;
} {
  const role = ROLE_COPY[ctx.role] || ROLE_COPY.viewer;
  const inviter = (ctx.inviterName || ctx.inviterEmail || "A teammate").trim();
  const company = (ctx.inviterCompany || "").trim();
  const workspace = ctx.workspaceName.trim() || "a workspace";
  const expiry = new Date(ctx.expiresAt);
  const expiryStr = expiry.toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Display name on the From header makes it look inviter-initiated, e.g. "Jane Doe (via Okiru)".
  const fromName = `${inviter}${company ? ` · ${company}` : ""} (via Okiru)`;
  const subject = `${inviter} invited you to “${workspace}” on Okiru`;

  const inviterLine = company
    ? `${escapeHtml(inviter)} from <strong>${escapeHtml(company)}</strong>`
    : `<strong>${escapeHtml(inviter)}</strong>`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #6b7280;">${escapeHtml(inviter)} shared a project with you</p>
      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; line-height: 1.3;">
        Join “${escapeHtml(workspace)}” on Okiru
      </h1>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.55; color: #374151;">
        ${inviterLine} added you to <strong>${escapeHtml(workspace)}</strong> as a
        <strong>${escapeHtml(role.label)}</strong>. ${escapeHtml(role.description)}
      </p>
      <div style="margin: 0 0 24px;">
        <a href="${escapeHtml(ctx.acceptUrl)}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 11px 22px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Open project
        </a>
      </div>
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin: 0 0 20px; font-size: 13px; color: #4b5563;">
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #6b7280;">Project</span>
          <span style="color: #111827; font-weight: 500;">${escapeHtml(workspace)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #6b7280;">Invited by</span>
          <span style="color: #111827; font-weight: 500;">${escapeHtml(inviter)}${company ? ` · ${escapeHtml(company)}` : ""}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #6b7280;">Role</span>
          <span style="color: #111827; font-weight: 500;">${escapeHtml(role.label)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #6b7280;">Sent to</span>
          <span style="color: #111827; font-weight: 500;">${escapeHtml(ctx.inviteeEmail)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #6b7280;">Expires</span>
          <span style="color: #111827; font-weight: 500;">${escapeHtml(expiryStr)}</span>
        </div>
      </div>
      <p style="margin: 0 0 6px; font-size: 12px; color: #6b7280;">
        If the button doesn't work, paste this link into your browser:
      </p>
      <p style="margin: 0 0 24px; font-size: 12px; color: #4f46e5; word-break: break-all;">
        ${escapeHtml(ctx.acceptUrl)}
      </p>
      <p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5;">
        You're receiving this because ${escapeHtml(inviter)} invited you on Okiru. If you don't recognise this invitation, you can safely ignore it. The invitation expires on ${escapeHtml(expiryStr)}.
      </p>
    </div>
  `;

  const text = [
    `${inviter} invited you to "${workspace}" on Okiru`,
    "",
    `${inviter}${company ? ` from ${company}` : ""} added you as ${role.label}.`,
    role.description,
    "",
    `Open project: ${ctx.acceptUrl}`,
    "",
    `Sent to: ${ctx.inviteeEmail}`,
    `Expires: ${expiryStr}`,
  ].join("\n");

  return { subject, html, text, fromName };
}

export async function sendWorkspaceInviteEmail(ctx: WorkspaceInviteEmailContext): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    logger.warn("SMTP not configured - skipping workspace invite email", { to: ctx.inviteeEmail });
    return false;
  }
  const { subject, html, text, fromName } = buildWorkspaceInviteEmail(ctx);
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER!;

  try {
    await t.sendMail({
      from: { name: fromName, address: fromAddress },
      to: ctx.inviteeEmail,
      replyTo: ctx.inviterEmail || undefined,
      subject,
      html,
      text,
    });
    logger.info("Workspace invite email sent", {
      to: ctx.inviteeEmail,
      workspace: ctx.workspaceName,
      inviter: ctx.inviterName,
    });
    return true;
  } catch (err: any) {
    logger.error("Failed to send workspace invite email", err, { to: ctx.inviteeEmail });
    return false;
  }
}

export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendLoginNotification(userEmail: string, fullName: string | null, orgName: string | null) {
  const t = getTransporter();
  if (!t) {
    logger.debug("SMTP not configured - skipping login notification", { user: userEmail });
    return;
  }
  logger.debug("Sending login notification", { user: userEmail, org: orgName });

  const displayName = fullName || userEmail;
  const org = orgName || "Unknown Organization";
  const loginTime = new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: ADMIN_EMAIL,
      subject: `Staff Login - ${displayName}`,
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
              <p style="margin: 0; font-size: 11px; color: #6b7280;">Sent by Okiru Pro - B-BBEE Compliance Platform</p>
            </div>
          </div>
        </div>
      `,
    });
    logger.info("Login notification sent", { user: userEmail });
  } catch (err: any) {
    logger.error("Failed to send login notification", err, { user: userEmail });
  }
}
