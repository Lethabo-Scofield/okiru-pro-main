/**
 * Local SMTP smoke test:  npm run test-email   (from apps/web)
 *
 * Reads SMTP_* from apps/web/.env, connects to the mail server, upgrades to TLS,
 * logs in and sends one test message — without going through login/OTP.
 * The password is never printed.
 */
import "dotenv/config";
import { getSmtpTestTarget, isSmtpConfigured, sendSmtpTestEmail } from "../server/email";

async function main() {
  const host = process.env.SMTP_HOST || "(unset)";
  const port = process.env.SMTP_PORT || "587";
  const user = process.env.SMTP_USER || "(unset)";
  const { to, from } = getSmtpTestTarget();

  console.log("Okiru SMTP test");
  console.log(`  host : ${host}:${port} (${port === "465" ? "implicit TLS" : "STARTTLS"})`);
  console.log(`  user : ${user}`);
  console.log(`  from : ${from || "(unset)"}`);
  console.log(`  to   : ${to}`);
  console.log(`  pass : ${isSmtpConfigured() ? "set" : "NOT SET"}`);
  console.log("");

  const result = await sendSmtpTestEmail();

  if (result.ok) {
    console.log(`OK - test email sent (message id ${result.messageId}). Check the ${result.to} inbox.`);
    return;
  }

  const { category, message, hint } = result.failure;
  console.error(`FAILED [${category}]`);
  console.error(`  ${message}`);
  console.error("");
  console.error(`  Fix: ${hint}`);
  process.exitCode = 1;
}

main().catch((err) => {
  // Don't print the raw error object: keep output to the message only.
  console.error("FAILED [UNEXPECTED]", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
