/**
 * @vitest-environment jsdom
 *
 * The chat's contract with the user, not with the model: a question is never
 * lost (it stays on screen with the error under it), the reply renders, and
 * the request carries the conversation plus the open section — never workbook
 * content, which the server refuses to trust from the browser anyway.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EsgAssistantChat } from "../EsgAssistantChat";

const openPanel = () => fireEvent.click(screen.getByTestId("esg-assistant-open"));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EsgAssistantChat", () => {
  it("sends the conversation and active section, renders the reply", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ reply: "Fleet diesel is complete; water is missing Aug-25." }), {
        status: 200,
      }),
    );
    render(<EsgAssistantChat companyId="C-1" activeSectionId="e-data" />);
    openPanel();

    fireEvent.change(screen.getByTestId("esg-assistant-input"), {
      target: { value: "What is missing?" },
    });
    fireEvent.click(screen.getByTestId("esg-assistant-send"));

    await waitFor(() =>
      expect(screen.getByTestId("esg-assistant-msg-assistant")).toHaveTextContent(
        /water is missing/i,
      ),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/esg/workbook/C-1/assistant");
    const body = JSON.parse(String(init.body));
    expect(body.activeSectionId).toBe("e-data");
    expect(body.messages).toEqual([{ role: "user", content: "What is missing?" }]);
    expect(init.credentials).toBe("include");
  });

  it("keeps the question visible and shows the server's error under it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "The assistant is not configured on this server." }), {
        status: 503,
      }),
    );
    render(<EsgAssistantChat companyId="C-1" />);
    openPanel();

    fireEvent.change(screen.getByTestId("esg-assistant-input"), {
      target: { value: "hello?" },
    });
    fireEvent.click(screen.getByTestId("esg-assistant-send"));

    await waitFor(() =>
      expect(screen.getByTestId("esg-assistant-error")).toHaveTextContent(/not configured/i),
    );
    // The user's message did not vanish with the failure.
    expect(screen.getByTestId("esg-assistant-msg-user")).toHaveTextContent("hello?");
  });

  it("offers suggested questions that send on click", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ reply: "Nothing blocks submit." }), { status: 200 }),
    );
    render(<EsgAssistantChat companyId="C-1" />);
    openPanel();

    const suggestions = screen.getByTestId("esg-assistant-suggestions");
    fireEvent.click(suggestions.querySelectorAll("button")[0]!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.messages[0].content).toMatch(/missing before I can submit/i);
  });
});
