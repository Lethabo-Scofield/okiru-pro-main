// @vitest-environment jsdom
/**
 * The account menu carries a "Calculation review" link for the named reviewers
 * only: shown when the api says this account may review, hidden while that is
 * unknown, hidden when it says no, and hidden when the check fails.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@toolkit/lib/auth", () => ({
  useAuth: () => ({
    user: { fullName: "Pat Reviewer", username: "pat", email: "pat@example.com" },
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/TokenBalancePill", () => ({ TokenBalancePill: () => null }));

import { UserAccountMenu } from "../UserAccountMenu";

beforeAll(() => {
  // Radix positions the menu with these; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

function accessAnswers(answer: () => Promise<Response>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith("/api/calculation-review/access")) return answer();
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const accessCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/calculation-review/access")).length;

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId("user-chip"));
  await screen.findByTestId("menu-settings");
  return user;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("the Calculation review link in the account menu", () => {
  it("is shown above Settings & billing for a reviewer, and opens the review", async () => {
    const fetchMock = accessAnswers(async () => new Response(JSON.stringify({ success: true, allowed: true }), { status: 200 }));
    render(<UserAccountMenu showTokens={false} />);
    await waitFor(() => expect(accessCalls(fetchMock)).toBe(1));

    const user = await openMenu();
    const link = await screen.findByRole("menuitem", { name: "Calculation review" });
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());
    expect(items.indexOf("Calculation review")).toBe(items.indexOf("Settings & billing") - 1);

    await user.click(link);
    await waitFor(() => expect(window.location.pathname).toBe("/calculation-review"));
    // Asked once for this mount, however often the menu is opened.
    expect(accessCalls(fetchMock)).toBe(1);
  });

  it("is hidden for anyone the api does not name", async () => {
    const fetchMock = accessAnswers(async () => new Response(JSON.stringify({ success: true, allowed: false }), { status: 200 }));
    render(<UserAccountMenu showTokens={false} />);
    await waitFor(() => expect(accessCalls(fetchMock)).toBe(1));
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Calculation review" })).toBeNull();
  });

  it("is hidden when the check fails", async () => {
    const fetchMock = accessAnswers(async () => new Response("Server error", { status: 500 }));
    render(<UserAccountMenu showTokens={false} />);
    await waitFor(() => expect(accessCalls(fetchMock)).toBe(1));
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Calculation review" })).toBeNull();
  });

  it("is hidden while the answer is not in yet", async () => {
    accessAnswers(() => new Promise<Response>(() => {}));
    render(<UserAccountMenu showTokens={false} />);
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Calculation review" })).toBeNull();
  });
});
