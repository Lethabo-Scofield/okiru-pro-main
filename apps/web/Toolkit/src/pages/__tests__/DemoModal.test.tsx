// @vitest-environment jsdom
/**
 * "Book a demo" says "Request received" only when it was. It used to say so
 * whatever happened — including a 404 — and production's requests were lost.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DemoModal } from "../siteChrome";

function fill() {
  fireEvent.change(screen.getByPlaceholderText("Thabo Nkosi"), { target: { value: "Mpho" } });
  fireEvent.change(screen.getByPlaceholderText("Acme Corp"), { target: { value: "Acme" } });
  fireEvent.change(screen.getByPlaceholderText("you@company.co.za"), { target: { value: "mpho@acme.example" } });
  fireEvent.click(screen.getByRole("button", { name: /Send request/ }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DemoModal", () => {
  it("thanks the visitor when the team has the request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    render(<DemoModal onClose={() => {}} />);
    fill();
    expect(await screen.findByText("Request received.")).toBeInTheDocument();
  });

  it("says it was not sent, with a way through, when it was not", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "We could not send your request just now." }), { status: 503 })),
    );
    render(<DemoModal onClose={() => {}} />);
    fill();
    const error = await screen.findByTestId("demo-request-error");
    expect(error).toHaveTextContent("We could not send your request just now.");
    expect(screen.getByRole("link", { name: "contact@okiru.co.za" })).toHaveAttribute("href", expect.stringContaining("mailto:contact@okiru.co.za"));
    expect(screen.queryByText("Request received.")).toBeNull();
  });

  it("does not claim success when the request never left the browser", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<DemoModal onClose={() => {}} />);
    fill();
    expect(await screen.findByTestId("demo-request-error")).toHaveTextContent(/check your connection/);
  });
});
