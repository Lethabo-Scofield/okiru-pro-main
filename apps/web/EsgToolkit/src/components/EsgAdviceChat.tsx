import { useMemo, useState } from "react";
import { AlertTriangle, Leaf, Loader2, Send, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { API_BASE } from "@toolkit/lib/config";
import { useEsgStore } from "../lib/esgStore";

type AdviceSource = { type: string; id: string; label: string; slides?: number[] };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; sources?: AdviceSource[]; warnings?: string[] };

const STARTERS = [
  "Which ESG pillar is reducing our score most?",
  "Explain our Scope 1 and Scope 2 position",
  "What evidence should we collect next?",
  "What is double materiality?",
  "Which reporting framework fits us?",
  "How do B-BBEE and ESG overlap?",
];

function runtimeSnapshot() {
  const state = useEsgStore.getState();
  return {
    companyId: state.companyId,
    companyName: state.companyName,
    scorecard: state.scorecard,
    stance: state.getStance(),
    reportMode: state.getReportMode(),
    selectedTopics: state.getSelectedTopics(),
  };
}

function EsgAdvicePanel() {
  const companyId = useEsgStore((state) => state.companyId);
  const companyName = useEsgStore((state) => state.companyName);
  const scorecard = useEsgStore((state) => state.scorecard);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState(STARTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(() => {
    const overall = scorecard ? `${(scorecard.overallPercent * 100).toFixed(1)}%` : "Score unavailable";
    return `${companyName || "Current company"} · ${overall} overall ESG`;
  }, [companyName, scorecard]);

  async function sendMessage(value: string) {
    const message = value.trim();
    if (!message || !companyId || loading) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }]);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/esg/scorecards/${encodeURIComponent(companyId)}/advice/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId, runtimeSnapshot: runtimeSnapshot() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `ESG advice request failed (${response.status})`);
      setConversationId(data.conversationId || conversationId);
      if (Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length) setSuggestions(data.suggestedQuestions);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer || "I could not find a grounded ESG answer.",
        sources: Array.isArray(data.sources) ? data.sources : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      }]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "ESG advice request failed";
      setError(message);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "I could not answer that yet. Your ESG scorecard was not changed.", warnings: [message] }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1116] text-white" data-testid="esg-advice-chat">
      <header className="border-b border-white/10 px-5 py-4 pr-12">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/20"><Leaf className="h-4 w-4" /></span>
          <div>
            <h2 className="text-[16px] font-semibold">Ask Okiru</h2>
            <p className="mt-0.5 text-[12px] text-white/45">{context}</p>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_240px]">
        <div className="flex min-h-[390px] flex-col">
          <div className="max-h-[440px] flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="flex min-h-[240px] max-w-lg flex-col justify-center">
                <p className="text-[20px] font-semibold">Ask about your ESG score, evidence, or reporting.</p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/45">Answers use the current ESG scorecard and Okiru's sourced ESG ontology. Regulatory details are flagged when they need current verification.</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {["Explain the score", "Show weak pillar", "Explain materiality"].map((label) => (
                    <button key={label} type="button" onClick={() => void sendMessage(label)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left text-[12px] text-white/70 transition hover:bg-white/[0.08]">{label}</button>
                  ))}
                </div>
              </div>
            ) : messages.map((message) => (
              <motion.div key={message.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${message.role === "user" ? "rounded-br-sm bg-white text-black" : "rounded-bl-sm border border-white/10 bg-white/[0.055] text-white/85"}`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.sources && message.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.sources.map((item) => <span key={`${item.type}-${item.id}`} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/45 ring-1 ring-white/10">{item.label}{item.slides?.length ? ` · slides ${item.slides.join(", ")}` : ""}</span>)}</div>}
                  {message.warnings?.map((warning) => <div key={warning} className="mt-2 flex gap-1.5 text-[11px] text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{warning}</span></div>)}
                </div>
              </motion.div>
            ))}
            {loading && <div className="flex items-center gap-2 text-[12px] text-white/45"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading the ESG scorecard and ontology...</div>}
          </div>
          <form className="flex gap-2 border-t border-white/10 bg-black/20 p-4" onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask an ESG question..." maxLength={2000} className="min-h-[48px] max-h-28 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[13px] outline-none placeholder:text-white/30 focus:border-emerald-300/35" data-testid="esg-advice-input" />
            <button type="submit" disabled={!input.trim() || loading || !companyId} className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-300 text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-35" title="Send" data-testid="esg-advice-send">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
          </form>
          {error && <p className="px-4 pb-3 text-[11px] text-red-400">{error}</p>}
        </div>
        <aside className="border-t border-white/10 bg-white/[0.025] p-4 lg:border-l lg:border-t-0">
          <p className="mb-3 text-[11px] font-medium text-white/40">Useful prompts</p>
          <div className="space-y-1.5">{suggestions.slice(0, 6).map((question) => <button key={question} type="button" onClick={() => void sendMessage(question)} disabled={loading} className="w-full rounded-xl px-3 py-2.5 text-left text-[12px] leading-snug text-white/60 transition hover:bg-white/[0.055] hover:text-white disabled:opacity-40">{question}</button>)}</div>
        </aside>
      </div>
    </section>
  );
}

export function EsgAdvisor() {
  const companyId = useEsgStore((state) => state.companyId);
  const [open, setOpen] = useState(false);
  if (!companyId) return null;
  return (
    <>
      <motion.button type="button" onClick={() => setOpen(true)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="fixed bottom-[4.75rem] right-5 z-[9998] flex items-center gap-2 rounded-full bg-emerald-300 py-2 pl-2 pr-4 text-[13px] font-semibold text-emerald-950 shadow-[0_16px_40px_-18px_rgba(52,211,153,0.8)]" aria-label="Open ESG advisor" data-testid="button-esg-advisor-open"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-950/10"><Leaf className="h-4 w-4" /></span><span>Ask Okiru</span></motion.button>
      <AnimatePresence>{open && <motion.div className="fixed inset-0 z-[9999] bg-black/50 p-3 backdrop-blur-[2px] sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}><motion.div role="dialog" aria-modal="true" aria-label="ESG advisor" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} className="absolute bottom-20 right-3 w-[calc(100vw-1.5rem)] max-w-[860px] sm:right-5"><button type="button" onClick={() => setOpen(false)} aria-label="Close ESG advisor" className="absolute right-3 top-3 z-10 rounded-full p-2 text-white/45 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button><EsgAdvicePanel /></motion.div></motion.div>}</AnimatePresence>
    </>
  );
}
