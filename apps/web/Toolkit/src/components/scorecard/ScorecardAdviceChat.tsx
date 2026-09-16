import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Mic, Send, Square } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { API_BASE } from "@toolkit/lib/config";
import { useActiveClient } from "@toolkit/lib/client-context";
import { useBbeeStore } from "@toolkit/lib/store";
import { cn } from "@toolkit/lib/utils";

type AdviceSource = {
  type: string;
  id: string;
  label: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AdviceSource[];
  warnings?: string[];
  tables?: AdviceTable[];
  actions?: AdviceAction[];
};

type AdviceTable = {
  title?: string;
  columns: string[];
  rows: string[][];
};

type AdviceAction = {
  label: string;
  route: string;
  reason?: string;
};

const STARTERS = [
  "Why did we receive this B-BBEE level?",
  "Which pillar is reducing our score most?",
  "Did we fail any priority-element subminimum?",
  "What evidence is missing?",
  "How many points do we need for the next level?",
  "What should we prioritise before verification?",
];

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function compactScorecardSnapshot(state: ReturnType<typeof useBbeeStore.getState>) {
  return {
    scorecard: state.scorecard,
    client: {
      id: state.client.id,
      name: state.client.name,
      sectorCode: state.client.sectorCode,
      scorecardType: state.client.scorecardType,
      companySize: state.client.companySize,
      financialYear: state.client.financialYear,
      revenue: state.client.revenue,
      npat: state.client.npat,
      leviableAmount: state.client.leviableAmount,
      numberOfEmployees: state.client.numberOfEmployees,
    },
  };
}

interface ScorecardAdviceChatProps {
  compact?: boolean;
}

export function ScorecardAdviceChat({ compact = false }: ScorecardAdviceChatProps) {
  const [, navigate] = useLocation();
  const { activeClientId } = useActiveClient();
  const store = useBbeeStore();
  const persistedScorecardId = typeof window !== "undefined"
    ? localStorage.getItem("okiru-pro-active-client")
    : null;
  const scorecardId = activeClientId || store.activeClientId || store.client.id || persistedScorecardId;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState(STARTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseRef = useRef("");

  const contextLabel = useMemo(() => {
    const level = store.scorecard.isDiscounted ? store.scorecard.discountedLevel : store.scorecard.achievedLevel;
    const levelText = level >= 9 ? "Non-Compliant" : `Level ${level}`;
    return `${store.client.name || "Current company"} · ${levelText} · ${store.scorecard.total.score.toFixed(2)} pts`;
  }, [store.client.name, store.scorecard]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || !scorecardId || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/scorecards/${encodeURIComponent(scorecardId)}/advice/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId,
          toolkitId: "bbbee",
          runtimeSnapshot: compactScorecardSnapshot(useBbeeStore.getState()),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || `Advice request failed (${res.status})`);
      }

      setConversationId(data.conversationId || conversationId);
      setSuggestedQuestions(Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length
        ? data.suggestedQuestions
        : STARTERS);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer || "I could not generate a reliable answer from this scorecard.",
          sources: Array.isArray(data.sources) ? data.sources : [],
          warnings: Array.isArray(data.warnings) ? data.warnings : [],
          tables: Array.isArray(data.tables) ? data.tables : [],
          actions: Array.isArray(data.actions) ? data.actions : [],
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Advice request failed";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I could not answer that yet. The scorecard stayed unchanged.",
          warnings: [msg],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleVoiceInput() {
    if (!voiceSupported || typeof window === "undefined") {
      setError("Voice input is not available in this browser.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition() as SpeechRecognitionLike;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-ZA";
    voiceBaseRef.current = input.trim();
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript || "";
      }
      if (transcript.trim()) {
        const prefix = voiceBaseRef.current ? `${voiceBaseRef.current} ` : "";
        setInput(`${prefix}${transcript.trim()}`);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError("I could not hear that clearly. Please try again or type it.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[#101012] text-white shadow-[0_30px_90px_-40px_rgba(0,0,0,0.95)]" data-testid="scorecard-advice-chat">
      <div className="border-b border-white/10 bg-white/[0.018] px-5 py-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight">Ask Okiru</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-white/45">
              {compact ? contextLabel : `Analysing ${contextLabel}`}
            </p>
          </div>
          <div className="mt-0.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium text-white/50 ring-1 ring-white/10">
            Scorecard
          </div>
        </div>
      </div>

      <div className={cn("grid gap-0", compact ? "lg:grid-cols-[1fr_240px]" : "lg:grid-cols-[1fr_280px]")}>
        <div className={cn("flex flex-col", compact ? "min-h-[360px]" : "min-h-[420px]")}>
          <div className={cn("flex-1 space-y-4 overflow-y-auto px-5 py-5", compact ? "max-h-[430px]" : "max-h-[540px]")}>
            {messages.length === 0 ? (
              <div className={cn("h-full flex flex-col justify-center", compact ? "min-h-[210px]" : "min-h-[260px]")}>
                <div className="max-w-[460px]">
                  <p className="text-[20px] font-semibold tracking-tight text-white">Ask about the score, evidence, or next step.</p>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-white/45">
                  {compact
                    ? "Speak or type naturally. Okiru can answer with tables and open the right toolkit page when helpful."
                    : "Ask about levels, weak pillars, subminimums, missing evidence, or the next best action."}
                  </p>
                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    {["Explain the level", "Show weak pillars", "What should I open?"].map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => void sendMessage(label)}
                        className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 text-left text-[12px] text-white/70 transition hover:bg-white/[0.075] hover:text-white"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div className={cn(
                    "max-w-[86%] px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm",
                    message.role === "user"
                      ? "rounded-[18px] rounded-br-md bg-white text-black"
                      : "rounded-[18px] rounded-bl-md border border-white/10 bg-white/[0.055] text-white/82",
                  )}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.tables && message.tables.length > 0 && (
                      <div className="mt-3 space-y-3">
                        {message.tables.map((table, tableIndex) => (
                          <div key={`${message.id}-table-${tableIndex}`} className="overflow-hidden rounded-[14px] border border-white/10 bg-black/20">
                            {table.title && (
                              <div className="border-b border-white/10 bg-white/[0.045] px-3 py-2 text-[11px] font-medium text-white/70">
                                {table.title}
                              </div>
                            )}
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[420px] text-left text-[11px]">
                                <thead>
                                  <tr className="border-b border-white/10 bg-white/[0.03] text-white/45">
                                    {table.columns.map((column) => (
                                      <th key={column} className="px-3 py-2.5 font-medium">
                                        {column}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {table.rows.map((row, rowIndex) => (
                                    <tr key={`${message.id}-row-${rowIndex}`} className="border-b border-white/[0.06] last:border-b-0">
                                      {table.columns.map((column, columnIndex) => (
                                        <td key={`${column}-${columnIndex}`} className="px-3 py-2.5 text-white/70">
                                          {row[columnIndex] || "-"}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {message.actions && message.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.actions.map((action) => (
                          <button
                            key={`${message.id}-${action.route}`}
                            type="button"
                            onClick={() => navigate(action.route)}
                            className="rounded-full bg-white px-3.5 py-2 text-[11px] font-medium text-black transition hover:bg-white/90"
                            title={action.reason || action.label}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.sources.map((source) => (
                          <span key={`${source.type}-${source.id}`} className="rounded-full bg-white/[0.045] px-2 py-0.5 text-[10px] text-white/40 ring-1 ring-white/10">
                            {source.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {message.warnings && message.warnings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {message.warnings.map((warning) => (
                          <div key={warning} className="flex gap-1.5 text-[11px] text-amber-500">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-white/45">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reading this scorecard...
              </div>
            )}
          </div>

          <form
            className="flex gap-2 border-t border-white/10 bg-black/25 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(input);
            }}
          >
            <div className="flex-1 rounded-[20px] border border-white/10 bg-white/[0.055] shadow-inner shadow-black/10 focus-within:border-white/25">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={listening ? "Listening..." : "Ask or record your question..."}
                className="max-h-28 min-h-[48px] w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/30"
                maxLength={2000}
                data-testid="scorecard-advice-input"
              />
              {listening && (
                <div className="flex items-center gap-2 px-3 pb-2 text-[11px] text-white/55">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Recording. Speak clearly, then tap stop.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={!voiceSupported || loading}
              className={cn(
                "flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-white/10 transition disabled:opacity-35",
                listening ? "bg-red-500 text-white shadow-[0_0_0_6px_rgba(239,68,68,0.12)]" : "bg-white/[0.065] text-white/72 hover:bg-white/12",
              )}
              data-testid="scorecard-advice-record"
              title={voiceSupported ? (listening ? "Stop recording" : "Record question") : "Voice input unavailable"}
            >
              {listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="submit"
              disabled={!input.trim() || loading || !scorecardId}
              className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_24px_-14px_rgba(255,255,255,0.9)] transition hover:bg-white/90 disabled:opacity-35"
              data-testid="scorecard-advice-send"
              title="Send"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          {error && <p className="px-3 pb-3 text-[11px] text-red-400">{error}</p>}
        </div>

        <aside className="border-t border-white/10 bg-white/[0.025] p-4 lg:border-l lg:border-t-0">
          <p className="mb-3 px-1 text-[11px] font-medium text-white/38">Useful prompts</p>
          <div className="space-y-1.5">
            {suggestedQuestions.slice(0, 6).map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => void sendMessage(question)}
                disabled={loading}
                className="w-full rounded-[15px] border border-transparent bg-transparent px-3 py-2.5 text-left text-[12px] leading-snug text-white/60 transition hover:border-white/10 hover:bg-white/[0.055] hover:text-white/85 disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
