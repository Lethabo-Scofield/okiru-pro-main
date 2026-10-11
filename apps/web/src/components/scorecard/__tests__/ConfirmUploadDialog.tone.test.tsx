/**
 * @vitest-environment jsdom
 *
 * The confirm dialog renders in a portal, outside the dark signed-in app, on
 * the theme's own (light) background. Its "What to check" disclosure must not
 * use the app's dark-glass colours there: white on hover vanishes on a light
 * dialog, a white/30 focus ring is invisible on it, and the app's --body and
 * --muted are not defined outside `.okiru-app`.
 */
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { ConfirmUploadDialog } from "../ConfirmUploadDialog";
import { Disclosure } from "@/components/upload/flow/Disclosure";

const pending = { files: [new File(["x"], "register.pdf", { type: "application/pdf" })], batchLabel: "Ownership" };

function summaryParts(details: HTMLElement) {
  const summary = details.querySelector("summary") as HTMLElement;
  const chevron = summary.querySelector("svg") as SVGElement;
  return { summary: summary.className, chevron: chevron.getAttribute("class") ?? "" };
}

describe("ConfirmUploadDialog — the 'What to check' disclosure on a light dialog", () => {
  it("keeps a visible hover colour and focus ring, and no app-only colour variables", async () => {
    render(<ConfirmUploadDialog pending={pending} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const checks = await screen.findByTestId("confirm-upload-checks");
    const { summary, chevron } = summaryParts(checks);

    expect(summary).not.toMatch(/hover:text-white/);
    expect(summary).not.toMatch(/ring-white/);
    expect(summary).not.toMatch(/var\(--(body|muted)\)/);
    expect(chevron).not.toMatch(/var\(--(body|muted)\)/);

    expect(summary).toMatch(/\bhover:text-foreground\b/);
    expect(summary).toMatch(/\bfocus-visible:ring-2\b/);
    expect(summary).toMatch(/\bfocus-visible:ring-ring\b/);
    expect(summary).toMatch(/\bfocus-visible:ring-offset-2\b/);
    expect(chevron).toMatch(/\btext-muted-foreground\b/);
  });
});

describe("Disclosure — tone", () => {
  it("keeps the dark app colours by default, with the meta at body contrast", () => {
    render(
      <Disclosure summary="More" meta="optional now" testId="d">
        <p>body</p>
      </Disclosure>,
    );
    const { summary, chevron } = summaryParts(screen.getByTestId("d"));
    expect(summary).toMatch(/text-\[color:var\(--body\)\]/);
    expect(summary).toMatch(/hover:text-white/);
    expect(chevron).toMatch(/text-\[color:var\(--muted\)\]/);
    // The meta is something a person reads to decide (a count, "optional now"):
    // --muted is about 2.8:1 on the panels, --body passes AA.
    const meta = screen.getByText("optional now");
    expect(meta.className).toMatch(/text-\[color:var\(--body\)\]/);
    expect(meta.className).not.toMatch(/var\(--muted\)/);
  });

  it("gives the meta the dialog's muted colour in the dialog tone", () => {
    render(
      <Disclosure summary="More" meta="3" testId="d" tone="dialog">
        <p>body</p>
      </Disclosure>,
    );
    const meta = screen.getByText("3");
    expect(meta.className).toMatch(/\btext-muted-foreground\b/);
    expect(meta.className).not.toMatch(/var\(--muted\)/);
  });
});
