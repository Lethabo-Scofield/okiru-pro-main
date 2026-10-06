// @vitest-environment jsdom
/**
 * /devmode is the team's feedback inbox. To anyone else the server refuses the
 * list (it holds clients' names and emails), and the page says so plainly
 * instead of printing the raw refusal.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DevMode from "../DevMode";

function renderWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DevMode />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DevMode", () => {
  it("tells someone off the team where feedback lives, not a raw refusal", async () => {
    renderWith(403, { message: "Feedback is for the Okiru team — it holds clients' names and email addresses." });
    const panel = await screen.findByTestId("feedback-team-only");
    expect(panel).toHaveTextContent("Feedback is for the Okiru team");
    expect(screen.getByRole("link", { name: "Sign in with your team account" })).toHaveAttribute("href", "/auth");
    expect(screen.queryByText(/^Failed to load feedback/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in the same way", async () => {
    renderWith(401, { message: "Not authenticated" });
    expect(await screen.findByTestId("feedback-team-only")).toBeInTheDocument();
  });
});
