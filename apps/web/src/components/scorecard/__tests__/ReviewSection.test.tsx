/**
 * @vitest-environment jsdom
 *
 * The reveal's findings used to be six always-open sibling panels, which pushed
 * the Build button off the bottom of the screen on any real evidence pack. They
 * are now counted, collapsible groups. Two properties make that safe rather
 * than merely tidier:
 *
 *   - a group states its count in the header, so collapsing never hides the
 *     FACT that there are findings — only their detail;
 *   - a group that needs a decision can open from the start, so the redesign
 *     cannot bury something the user has to act on.
 */
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReviewSection from "../ReviewSection";

describe("ReviewSection", () => {
  it("keeps the count visible while the detail stays collapsed", () => {
    render(
      <ReviewSection title="Evidence that didn’t reconcile" meta="3" testId="s">
        <p>the detail</p>
      </ReviewSection>,
    );
    expect(screen.getByText("Evidence that didn’t reconcile")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("the detail")).not.toBeInTheDocument();
  });

  it("opens on click and closes again", async () => {
    render(
      <ReviewSection title="What we read" meta="12 placed" testId="s">
        <p>the detail</p>
      </ReviewSection>,
    );
    const header = screen.getByRole("button", { name: /What we read/ });
    expect(header).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(header);
    expect(screen.getByText("the detail")).toBeInTheDocument();
    expect(header).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(header);
    expect(screen.queryByText("the detail")).not.toBeInTheDocument();
  });

  it("can open from the start, so a decision is never buried", () => {
    render(
      <ReviewSection title="Figures your documents disagree on" defaultOpen testId="s">
        <p>the detail</p>
      </ReviewSection>,
    );
    expect(screen.getByText("the detail")).toBeInTheDocument();
  });

  it("shows its summary line whether open or shut", async () => {
    render(
      <ReviewSection title="Documents still worth adding" summary="Neither blocks you." testId="s">
        <p>the detail</p>
      </ReviewSection>,
    );
    // Closed: the "why this matters" line is still readable.
    expect(screen.getByText("Neither blocks you.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Documents still worth adding/ }));
    expect(screen.getByText("Neither blocks you.")).toBeInTheDocument();
  });

  it("never signals tone by colour alone", () => {
    render(
      <ReviewSection
        title="Confirmed by more than one document"
        tone="good"
        meta="4"
        icon={<span data-testid="tone-icon" />}
        testId="s"
      >
        <p>the detail</p>
      </ReviewSection>,
    );
    // The icon and the counted headline carry the meaning too.
    expect(screen.getByTestId("tone-icon")).toBeInTheDocument();
    expect(screen.getByText("Confirmed by more than one document")).toBeInTheDocument();
  });
});
