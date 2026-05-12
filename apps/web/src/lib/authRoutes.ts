/**
 * Auth URL query conventions.
 * `entry=site` = marketing CTAs (Login / Get started).
 * Incomplete profiles: logged-in visitors see a chooser unless they have `redirect=`,
 * `resumeOnboarding=1`, or session flags from an in-flight signup.
 */
export const AUTH_ENTRY_SITE = "site";

export function marketingAuthPath(mode: "login" | "register"): string {
  const p = new URLSearchParams();
  p.set("entry", AUTH_ENTRY_SITE);
  if (mode === "register") p.set("mode", "register");
  return `/auth?${p.toString()}`;
}

/** Auth from app surfaces that require a return path (hub, certificates upload, …). */
export function gatedAuthPath(opts: { mode?: "login" | "register"; redirect: string }): string {
  const p = new URLSearchParams();
  p.set("redirect", opts.redirect);
  if (opts.mode === "register") p.set("mode", "register");
  return `/auth?${p.toString()}`;
}
