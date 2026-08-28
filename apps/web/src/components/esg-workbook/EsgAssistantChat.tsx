/**
 * The workbook assistant — a chat that knows THIS workbook.
 *
 * The server grounds every reply in the authorised workbook (scores,
 * validation findings, register rows), so the assistant can answer "what's
 * missing before submit?", "why is my Environmental score low?" or "is that
 * vehicle listed twice?" from the data — the conversational counterpart of the
 * validation box, and the piece the BBBEE workbook's review surfaces set the
 * expectation for.
 *
 * Deliberately a floating dock, not a sidebar section: the sidebar already
 * carries two panels, and a chat needs height. History is session state only —
 * a conversation about a workbook is scaffolding, not a record.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircleQuestion, Send, Sparkles, X } from "lucide-react";
import { API_BASE } from "@toolkit/lib/config";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  companyId: string;
  /** Section the user has open, so "this section" resolves server-side. */
  activeSectionId?: string;
};

/** Openers that teach what the assistant can actually do. */
const SUGGESTIONS = [
  "What's still missing before I can submit?",
  "Why is my Environmental score what it is?",
  "Any duplicates or data quality problems in my registers?",
  "What does this section need from me?",
];

export function EsgAssistantChat({ companyId, activeSectionId }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    // scrollTo is absent in jsdom; assigning scrollTop works everywhere.
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/assistant`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next, activeSectionId }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        // The question stays visible with the error under it — the user should
        // never wonder whether their message was lost.
        setError(data.error ?? "The assistant is unavailable right now.");
        return;
      }
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Could not reach the assistant — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--esg-glass-border,#2c2c2e)] bg-[#141416] px-4 py-2.5 text-[13px] font-medium text-[var(--esg-text,#f2f2f7)] shadow-lg shadow-black/40 hover:bg-[#1c1c1e]"
        data-testid="esg-assistant-open"
      >
        <Sparkles className="h-4 w-4 text-[var(--esg-acc-e,#1de9a0)]" />
        Ask about this workbook
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-40 flex h-[520px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--esg-glass-border,#2c2c2e)] bg-[#141416] shadow-2xl shadow-black/60"
      data-testid="esg-assistant-panel"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--esg-acc-e,#1de9a0)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--esg-text,#f2f2f7)]">
            Workbook assistant
          </p>
          <p className="truncate text-[10px] text-[var(--esg-text3,#636366)]">
            Answers from your saved data, scores and validation — it never invents figures.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="rounded p-1 text-[var(--esg-text3,#636366)] hover:text-[var(--esg-text,#f2f2f7)]"
          data-testid="esg-assistant-close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="space-y-2" data-testid="esg-assistant-suggestions">
            <p className="flex items-center gap-1.5 text-[11px] text-[var(--esg-text3,#636366)]">
              <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0" /> Try one of these:
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left text-[12px] leading-5 text-[var(--esg-text2,#8e8e93)] hover:bg-white/[0.06] hover:text-[var(--esg-text,#f2f2f7)]"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            data-testid={`esg-assistant-msg-${m.role}`}
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--esg-acc-e,#1de9a0)]/[0.12] px-3 py-2 text-[12.5px] leading-5 text-[var(--esg-text,#f2f2f7)]"
                  : "max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12.5px] leading-5 text-[#d1d1d6]"
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy ? (
          <p
            className="flex items-center gap-2 text-[11px] text-[var(--esg-text3,#636366)]"
            data-testid="esg-assistant-busy"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your workbook…
          </p>
        ) : null}
        {error ? (
          <p className="text-[11px] leading-5 text-amber-300" data-testid="esg-assistant-error">
            {error}
          </p>
        ) : null}
      </div>

      <form
        className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about scores, gaps, duplicates…"
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-[var(--esg-input-border,#2c2c2e)] bg-[var(--esg-input-bg,#0e0e10)] px-3 py-2 text-[12.5px] text-[var(--esg-text,#f2f2f7)] placeholder:text-[var(--esg-text3,#636366)] focus:outline-none focus:ring-1 focus:ring-[var(--esg-acc-e,#1de9a0)]/50"
          data-testid="esg-assistant-input"
        />
        <button
          type="submit"
          disabled={busy || draft.trim() === ""}
          aria-label="Send"
          className="rounded-lg bg-[var(--esg-acc-e,#1de9a0)]/[0.15] p-2 text-[var(--esg-acc-e,#1de9a0)] disabled:opacity-40"
          data-testid="esg-assistant-send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export default EsgAssistantChat;
