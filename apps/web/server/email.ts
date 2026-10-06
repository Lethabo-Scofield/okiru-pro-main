import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import { createLogger } from "./logger";

const logger = createLogger("Email");

const ADMIN_EMAIL = "cmyezwa@okiru.co.za";

let transporter: nodemailer.Transporter | null = null;

/**
 * The SMTP password only ever comes from the environment (a local, git-ignored
 * .env or the host's secret store). `SMTP_PASS` is still honoured so existing
 * deployments keep working, but `SMTP_PASSWORD` is the documented name.
 */
function getSmtpPassword(): string | undefined {
  return process.env.SMTP_PASSWORD || process.env.SMTP_PASS || undefined;
}

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = getSmtpPassword();

  if (!host || !user || !pass) {
    logger.debug("SMTP not configured - email transport unavailable", { host: !!host, user: !!user, pass: !!pass });
    return null;
  }

  logger.info("Initializing SMTP transport", { host, port });
  transporter = nodemailer.createTransport({
    host,
    port,
    // 465 = implicit TLS. Anything else (Microsoft 365 uses 587) starts in plain
    // text and MUST upgrade via STARTTLS — requireTLS makes the send fail rather
    // than silently fall back to an unencrypted session.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2", servername: host },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  return transporter;
}

export type SmtpErrorCategory =
  | "SMTP_AUTH_DISABLED"
  | "AUTH_FAILED"
  | "INVALID_SENDER"
  | "TLS_FAILED"
  | "CONNECTION_FAILED"
  | "UNKNOWN";

export interface SmtpFailure {
  category: SmtpErrorCategory;
  /** Safe to log or print: never contains the password. */
  message: string;
  /** What to check / change to fix it. */
  hint: string;
  code?: string;
  responseCode?: number;
}

function scrubSecrets(text: string): string {
  const pass = getSmtpPassword();
  return pass && pass.length >= 3 ? text.split(pass).join("***") : text;
}

/**
 * Turn a nodemailer/Microsoft 365 error into a category, a safe message and a
 * fix hint. Order matters: Microsoft's auth/sender rejections are checked before
 * the generic socket and TLS codes, because nodemailer wraps several failures in
 * ESOCKET / ECONNECTION.
 */
export function classifySmtpError(err: unknown): SmtpFailure {
  const e = (err ?? {}) as { code?: string; responseCode?: number; response?: string; message?: string };
  const code = e.code;
  const responseCode = e.responseCode;
  const raw = `${e.response ?? ""} ${e.message ?? ""}`;
  const text = raw.toLowerCase();
  const base = { code, responseCode };
  const safe = scrubSecrets(raw.replace(/\s+/g, " ").trim()).slice(0, 300);

  // Microsoft 365: SMTP AUTH switched off for the tenant or the mailbox.
  if (
    /smtpclientauthentication is disabled|5\.7\.139|5\.7\.57|basic authentication is disabled|authentication unsuccessful.*disabled/.test(text)
  ) {
    return {
      ...base,
      category: "SMTP_AUTH_DISABLED",
      message: safe || "Microsoft 365 rejected the login because SMTP AUTH is disabled.",
      hint:
        "Enable 'Authenticated SMTP' for the mailbox: Microsoft 365 admin center > Users > Active users > contact@okiru.co.za > Mail > Manage email apps > tick 'Authenticated SMTP'. " +
        "If the whole tenant blocks it, an admin must turn off 'Security defaults' or add a Conditional Access exception, and run `Set-TransportConfig -SmtpClientAuthenticationDisabled $false` in Exchange Online PowerShell.",
    };
  }

  // Wrong user/password, or MFA on the account (needs an app password).
  if (code === "EAUTH" || responseCode === 535 || /5\.7\.3\b|invalid login|authentication (failed|unsuccessful)|bad credentials/.test(text)) {
    return {
      ...base,
      category: "AUTH_FAILED",
      message: safe || "Microsoft 365 rejected the username or password.",
      hint:
        "Check SMTP_USER and SMTP_PASSWORD. If the account has MFA, the normal password is rejected — create an app password (or exempt the mailbox) and use that. Also confirm the mailbox is licensed and not blocked.",
    };
  }

  // The From address isn't allowed for the authenticated mailbox.
  if (
    code === "EENVELOPE" ||
    /5\.7\.60|sendasdenied|not allowed to send as|5\.2\.252|5\.1\.7|invalid (sender|from)|sender address rejected/.test(text)
  ) {
    return {
      ...base,
      category: "INVALID_SENDER",
      message: safe || "Microsoft 365 rejected the sender address.",
      hint:
        "SMTP_FROM must be the authenticated mailbox (SMTP_USER) or an alias/shared mailbox it has 'Send As' permission on. Use SMTP_FROM=\"Okiru Pro <contact@okiru.co.za>\" with SMTP_USER=contact@okiru.co.za.",
    };
  }

  // TLS / STARTTLS negotiation.
  if (
    code === "ETLS" ||
    /tls|ssl|certificate|starttls|wrong version number|handshake|self[- ]signed|cert_/.test(text)
  ) {
    return {
      ...base,
      category: "TLS_FAILED",
      message: safe || "TLS negotiation with the mail server failed.",
      hint:
        "Use SMTP_HOST=smtp.office365.com and SMTP_PORT=587 (STARTTLS). Port 465 is not offered by Microsoft 365. A corporate proxy or antivirus that intercepts TLS can also break this — try another network.",
    };
  }

  // Couldn't reach the server at all.
  if (
    code === "ECONNECTION" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EDNS" ||
    code === "ECONNRESET"
  ) {
    return {
      ...base,
      category: "CONNECTION_FAILED",
      message: safe || "Could not connect to the mail server.",
      hint:
        "Check SMTP_HOST (smtp.office365.com) and SMTP_PORT (587), your internet connection, and that your network/firewall allows outbound traffic on port 587.",
    };
  }

  return { ...base, category: "UNKNOWN", message: safe || "Unknown SMTP error.", hint: "See the message above; enable LOG_LEVEL=debug for more detail." };
}

/** An Error that is safe to hand to the logger (no password, no transport options). */
function toSafeError(err: unknown): Error {
  const f = classifySmtpError(err);
  const safe = new Error(`[${f.category}] ${f.message}`);
  safe.stack = undefined;
  return safe;
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
    logger.error("Failed to send OTP email", toSafeError(err), { to: toEmail });
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
    logger.error("Failed to send password reset email", toSafeError(err), { to: toEmail });
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
    logger.error("Failed to send workspace invite email", toSafeError(err), { to: ctx.inviteeEmail });
    return false;
  }
}

export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && getSmtpPassword());
}

/**
 * Who hears about feedback from the in-app widget. It used to be saved and
 * nothing else — the team only saw it if someone happened to open DevMode, and
 * a client's two reports sat unread for days. FEEDBACK_NOTIFY_EMAILS (comma or
 * semicolon separated) replaces the list.
 *
 * The project manager's address is webparam.ORG — the account on okiru.pro.
 * webparam.co.za has no mail server (no MX, no A record), so the first sends
 * hard-bounced with 550 5.4.310 "domain does not exist" while the relay
 * reported success.
 */
export const DEFAULT_FEEDBACK_RECIPIENTS = [
  "contact@okiru.co.za",
  "lawubrian15@gmail.com",
  "pm@webparam.org",
];

/**
 * Deliberately narrower than RFC 5322: no `?`, `&`, `%`, `=` or quotes, so an
 * address can go into a mailto: link or a header without carrying anything else
 * along (`a@b.co?bcc=…` is not an address here).
 */
const STRICT_EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** Single-line fields stay single-line, so a typed name cannot forge lines below it. */
function oneLine(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function getFeedbackRecipients(): string[] {
  const configured = (process.env.FEEDBACK_NOTIFY_EMAILS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => STRICT_EMAIL.test(s));
  return configured.length ? Array.from(new Set(configured)) : [...DEFAULT_FEEDBACK_RECIPIENTS];
}

export interface FeedbackEmailContext {
  feedbackId: string;
  message: string;
  category: string;
  /** Display label of the area it was filed under, e.g. "Procurement". */
  areaLabel: string;
  pageUrl: string | null;
  /** What the person typed into the widget — not verified. */
  userName: string | null;
  userEmail: string | null;
  /** The signed-in account, when there was one. Verified. */
  accountEmail: string | null;
  organizationName: string | null;
  createdAt: Date | string;
}

const FEEDBACK_CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  feature: "Idea",
  compliance: "Compliance",
  general: "Other",
};

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.APP_URL || "https://okiru.pro").replace(/\/+$/, "");
}

export function buildFeedbackEmail(ctx: FeedbackEmailContext): {
  subject: string;
  html: string;
  text: string;
  replyTo: string | null;
} {
  const base = appBaseUrl();
  const kind = FEEDBACK_CATEGORY_LABELS[ctx.category] || "Other";
  const area = oneLine(ctx.areaLabel) || "General";
  const accountEmail = ctx.accountEmail && STRICT_EMAIL.test(ctx.accountEmail) ? ctx.accountEmail : null;
  const typedEmail = oneLine(ctx.userEmail) || null;
  // Only the signed-in account's own address is trusted to receive a reply.
  // What an anonymous visitor typed is shown, labelled unverified, never wired
  // into Reply-To or a mailto link.
  const replyTo = accountEmail;
  const organization = oneLine(ctx.organizationName) || null;
  const who = oneLine(ctx.userName) || accountEmail || typedEmail || "Someone who was not signed in";
  const firstLine = oneLine(ctx.message.split(/\r?\n/).find((l) => l.trim()) || ctx.message);
  const gist = firstLine.length > 70 ? `${firstLine.slice(0, 67).trimEnd()}…` : firstLine;
  const subject = `[Okiru feedback] ${kind} · ${area} — ${gist}`;

  const pagePath = oneLine(ctx.pageUrl);
  const pageLink = pagePath ? `${base}${pagePath.startsWith("/") ? "" : "/"}${pagePath}` : null;
  const received = new Date(ctx.createdAt).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const identity = accountEmail
    ? `Signed in as ${accountEmail}`
    : "Not signed in — any email below was typed into the form and is unverified";

  const rows: Array<[string, string]> = [
    ["Type", escapeHtml(kind)],
    ["Area", escapeHtml(area)],
    ["From", escapeHtml(who)],
    ["Account", escapeHtml(identity)],
  ];
  if (typedEmail && typedEmail !== accountEmail) rows.push(["Email given", `${escapeHtml(typedEmail)} (unverified)`]);
  if (organization) rows.push(["Organisation", escapeHtml(organization)]);
  if (pageLink) {
    rows.push(["Page", `<a href="${escapeHtml(pageLink)}" style="color:#4f46e5;word-break:break-all;">${escapeHtml(pagePath)}</a>`]);
  }
  rows.push(["Received", escapeHtml(received)]);
  rows.push(["Reference", `<span style="font-family:'SF Mono',Monaco,monospace;font-size:12px;">${escapeHtml(ctx.feedbackId)}</span>`]);

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937;">
      <p style="margin:0 0 6px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(kind)} · ${escapeHtml(area)}</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.35;">New feedback from ${escapeHtml(who)}</h1>
      <div style="border-left:3px solid #4f46e5;background:#f9fafb;padding:14px 16px;margin:0 0 20px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(ctx.message)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 20px;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;width:110px;">${k}</td><td style="padding:6px 0;color:#111827;">${v}</td></tr>`,
          )
          .join("")}
      </table>
      <div style="margin:0 0 20px;">
        ${replyTo ? `<a href="mailto:${escapeHtml(replyTo)}?subject=${encodeURIComponent(`Re: your Okiru feedback`)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;margin-right:8px;">Reply to ${escapeHtml(who)}</a>` : ""}
        <a href="${escapeHtml(`${base}/devmode`)}" style="display:inline-block;border:1px solid #d1d5db;color:#374151;text-decoration:none;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:600;">Open in DevMode</a>
      </div>
      <p style="margin:0;font-size:11px;color:#9ca3af;">Sent by okiru.pro to the feedback list. ${replyTo ? "Replying to this email answers the signed-in account that sent it." : "The sender was not signed in, so replying goes only to the list."}</p>
    </div>
  `;

  const text = [
    `New feedback from ${who}`,
    `${kind} · ${area}`,
    "",
    ctx.message,
    "",
    identity,
    ...(typedEmail && typedEmail !== accountEmail ? [`Email given (unverified): ${typedEmail}`] : []),
    ...(organization ? [`Organisation: ${organization}`] : []),
    ...(pageLink ? [`Page: ${pageLink}`] : []),
    `Received: ${received}`,
    `Reference: ${ctx.feedbackId}`,
    "",
    `Triage: ${base}/devmode`,
  ].join("\n");

  return { subject, html, text, replyTo };
}

/**
 * Email the feedback list — or the part of it that has not had this report yet.
 * Never throws; the caller records the outcome.
 */
export async function sendFeedbackNotification(
  ctx: FeedbackEmailContext,
  recipients: string[] = getFeedbackRecipients(),
): Promise<{ sent: boolean; recipients: string[]; error?: string }> {
  const t = getTransporter();
  if (!t) {
    return { sent: false, recipients, error: "No mail transport configured (SMTP_HOST/SMTP_USER/SMTP_PASS)" };
  }
  const { subject, html, text, replyTo } = buildFeedbackEmail(ctx);
  try {
    await t.sendMail({
      from: { name: "Okiru Feedback", address: process.env.SMTP_FROM || process.env.SMTP_USER! },
      to: recipients,
      replyTo: replyTo || undefined,
      subject,
      html,
      text,
    });
    logger.info("Feedback notification sent", { feedbackId: ctx.feedbackId, recipients: recipients.length });
    return { sent: true, recipients };
  } catch (err: any) {
    logger.error("Failed to send feedback notification", err, { feedbackId: ctx.feedbackId });
    return { sent: false, recipients, error: String(err?.message || err).slice(0, 500) };
  }
}

/** Extra, non-sensitive context for a login notification. Never pass tokens, cookies or credentials here. */
export interface LoginNotificationContext {
  timestamp?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Where login notifications go. Override with LOGIN_NOTIFICATION_TO; defaults to the long-standing admin address. */
function getLoginNotificationRecipient(): string {
  return (process.env.LOGIN_NOTIFICATION_TO || "").trim() || ADMIN_EMAIL;
}

export async function sendLoginNotification(
  userEmail: string,
  fullName: string | null,
  orgName: string | null,
  context: LoginNotificationContext = {},
) {
  const t = getTransporter();
  if (!t) {
    logger.debug("SMTP not configured - skipping login notification", { user: userEmail });
    return;
  }
  logger.debug("Sending login notification", { user: userEmail, org: orgName });

  // Everything below is attacker-influenced (name, org, UA header), so escape it
  // before it goes into the admin's inbox.
  const displayName = escapeHtml(fullName || userEmail);
  const safeEmail = escapeHtml(userEmail);
  const org = escapeHtml(orgName || "Unknown Organization");
  const loginTime = (context.timestamp ?? new Date()).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });
  const ip = escapeHtml((context.ipAddress || "Unknown").slice(0, 64));
  const userAgent = escapeHtml((context.userAgent || "Unknown").slice(0, 200));

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: getLoginNotificationRecipient(),
      subject: `Staff Login - ${(fullName || userEmail).replace(/[\r\n]+/g, " ").slice(0, 120)}`,
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
                <td style="padding: 8px 0; color: #ffffff; font-size: 13px;">${safeEmail}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Organization</td>
                <td style="padding: 8px 0; color: #ffffff; font-size: 13px;">${org}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">Login Time</td>
                <td style="padding: 8px 0; color: #ffffff; font-size: 13px;">${loginTime}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">IP Address</td>
                <td style="padding: 8px 0; color: #ffffff; font-size: 13px;">${ip}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; vertical-align: top;">Device</td>
                <td style="padding: 8px 0; color: #ffffff; font-size: 12px; word-break: break-word;">${userAgent}</td>
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
    logger.error("Failed to send login notification", toSafeError(err), { user: userEmail });
  }
}

export async function sendDemoRequestEmail(params: {
  name: string;
  company: string;
  email: string;
  phone?: string;
  message?: string;
}): Promise<boolean> {
  const t = getTransporter();
  const to = ADMIN_EMAIL;
  const now = new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "full", timeStyle: "short" });

  if (!t) {
    logger.warn("SMTP not configured — logging demo request to console", params);
    console.log("\n=== DEMO REQUEST ===", params, "\n");
    return false;
  }

  try {
    await t.sendMail({
      from: `"Okiru Website" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      replyTo: params.email,
      subject: `Demo request from ${params.name} · ${params.company}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <div style="background:#0b0f1a;border-radius:12px;padding:32px;color:#ffffff;border:1px solid rgba(255,255,255,0.08);">
            <h2 style="margin:0 0 4px;font-size:18px;color:#818cf8;">New Demo Request</h2>
            <p style="margin:0 0 24px;font-size:12px;color:#6b7280;">Submitted ${now}</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#9ca3af;font-size:12px;width:90px;">Name</td><td style="padding:8px 0;color:#fff;font-size:14px;font-weight:600;">${params.name}</td></tr>
              <tr><td style="padding:8px 0;color:#9ca3af;font-size:12px;">Company</td><td style="padding:8px 0;color:#fff;font-size:14px;">${params.company}</td></tr>
              <tr><td style="padding:8px 0;color:#9ca3af;font-size:12px;">Email</td><td style="padding:8px 0;"><a href="mailto:${params.email}" style="color:#818cf8;">${params.email}</a></td></tr>
              ${params.phone ? `<tr><td style="padding:8px 0;color:#9ca3af;font-size:12px;">Phone</td><td style="padding:8px 0;color:#fff;font-size:14px;">${params.phone}</td></tr>` : ""}
              ${params.message ? `<tr><td style="padding:8px 12px 8px 0;color:#9ca3af;font-size:12px;vertical-align:top;">Message</td><td style="padding:8px 0;color:#d1d5db;font-size:13px;line-height:1.6;">${params.message.replace(/\n/g, "<br/>")}</td></tr>` : ""}
            </table>
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
              <a href="mailto:${params.email}?subject=Re: Demo request" style="display:inline-block;background:#e8724a;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:600;">Reply to ${params.name}</a>
            </div>
          </div>
        </div>`,
    });

    // Send confirmation to the requester
    await t.sendMail({
      from: `"Okiru" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: params.email,
      subject: "We've received your demo request · Okiru",
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <div style="background:#0b0f1a;border-radius:12px;padding:32px;color:#ffffff;border:1px solid rgba(255,255,255,0.08);">
            <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Thanks, ${params.name}.</h2>
            <p style="margin:0 0 16px;font-size:14px;color:#9ca3af;line-height:1.7;">We've received your demo request and will be in touch within one business day to schedule your 45-minute session.</p>
            <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.7;">In the meantime, feel free to reply to this email if you have any questions.</p>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">What to expect</p>
              <ul style="margin:0;padding:0 0 0 18px;color:#d1d5db;font-size:13px;line-height:2;">
                <li>Your transformation reporting today (10 min)</li>
                <li>Live walkthrough of the Okiru Toolkit (15 min)</li>
                <li>Net-Zero Roadmap using your own data (10 min)</li>
                <li>Engagement model &amp; next steps (10 min)</li>
              </ul>
            </div>
            <div style="margin-top:8px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0;font-size:12px;color:#6b7280;">Okiru · Braamfontein, Johannesburg · <a href="https://okiru.co.za" style="color:#818cf8;">okiru.co.za</a></p>
            </div>
          </div>
        </div>`,
    });

    logger.info("Demo request emails sent", { to: params.email });
    return true;
  } catch (err: any) {
    logger.error("Failed to send demo request email", toSafeError(err), params);
    return false;
  }
}

export type SmtpTestResult =
  | { ok: true; messageId: string; to: string; from: string }
  | { ok: false; failure: SmtpFailure };

/** What the test sends. Exposed so the script can print it without duplicating strings. */
export function getSmtpTestTarget(): { to: string; from: string } {
  return {
    to: (process.env.SMTP_TEST_TO || "").trim() || "contact@okiru.co.za",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  };
}

/**
 * Local smoke test for the mail setup. Connects, upgrades to TLS, logs in, then
 * sends one plain message — independent of any login/OTP flow. Never returns or
 * logs the password; failures come back classified with a fix hint.
 */
export async function sendSmtpTestEmail(): Promise<SmtpTestResult> {
  const t = getTransporter();
  if (!t) {
    return {
      ok: false,
      failure: {
        category: "UNKNOWN",
        message: "SMTP is not configured: SMTP_HOST, SMTP_USER and SMTP_PASSWORD must all be set.",
        hint: "Add them to apps/web/.env (see apps/web/.env.example), then run again.",
      },
    };
  }

  const { to, from } = getSmtpTestTarget();
  try {
    await t.verify(); // connection + STARTTLS + AUTH, no mail sent yet
    const info = await t.sendMail({
      from,
      to,
      subject: "Okiru SMTP Test",
      text: "Microsoft 365 SMTP is working correctly.",
      html: "<p>Microsoft 365 SMTP is working correctly.</p>",
    });
    return { ok: true, messageId: String(info.messageId ?? ""), to, from };
  } catch (err) {
    // A failed attempt may have left a half-open connection; rebuild next time.
    transporter = null;
    return { ok: false, failure: classifySmtpError(err) };
  }
}
