import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MessageSquarePlus,
  X,
  Loader2,
  Check,
  Bug,
  Lightbulb,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '@toolkit/lib/auth';
import { apiRequest } from '@toolkit/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const HIDDEN_PATHS = ['/devmode'];

type Category = 'bug' | 'feature' | 'general' | 'compliance';

const CATEGORIES: Array<{
  value: Category;
  label: string;
  hint: string;
  icon: typeof Bug;
  accent: string;
}> = [
  {
    value: 'bug',
    label: 'Bug',
    hint: 'Something is broken or behaves unexpectedly',
    icon: Bug,
    accent: 'from-rose-500/20 to-rose-500/5 border-rose-400/40 text-rose-200',
  },
  {
    value: 'feature',
    label: 'Feature idea',
    hint: 'Something new you would like the dev team to build',
    icon: Lightbulb,
    accent: 'from-amber-500/20 to-amber-500/5 border-amber-400/40 text-amber-200',
  },
  {
    value: 'compliance',
    label: 'Compliance note',
    hint: 'Calculation, scoring or B-BBEE rule that needs attention',
    icon: ShieldCheck,
    accent: 'from-emerald-500/20 to-emerald-500/5 border-emerald-400/40 text-emerald-200',
  },
  {
    value: 'general',
    label: 'General',
    hint: 'Anything else worth telling the dev team',
    icon: MessageCircle,
    accent: 'from-indigo-500/20 to-indigo-500/5 border-indigo-400/40 text-indigo-200',
  },
];

const PLACEHOLDERS: Record<Category, string> = {
  bug: 'Describe what you did, what you expected, and what happened instead.\nExample: "On Skills Dev tab, totals do not refresh after editing a row."',
  feature: 'What problem would this solve? Who would use it?\nExample: "Add a Download as PDF button on the certificate preview screen."',
  compliance: 'Which calculation or rule, and what should it do?\nExample: "Ownership scorecard: black women % should weight 1.25 instead of 1.0."',
  general: 'Share anything that would help the dev team understand your point.',
};

export function FeedbackWidget() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<Category>('bug');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open && user) {
      if (!name && user.fullName) setName(user.fullName);
      if (!email && user.email) setEmail(user.email);
    }
  }, [open, user, name, email]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && message.trim() && !submitting) {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting, message]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (HIDDEN_PATHS.some((p) => location.startsWith(p))) {
    return null;
  }

  const reset = () => {
    setMessage('');
    setCategory('bug');
    setJustSent(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    try {
      await apiRequest('POST', '/api/feedback', {
        message: message.trim(),
        category,
        pageUrl: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
        userName: name.trim() || null,
        userEmail: email.trim() || null,
      });
      setJustSent(true);
      setMessage('');
      toast({
        title: 'Feedback saved',
        description: 'Thanks — the dev team will see it in DevMode.',
      });
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1100);
    } catch (err) {
      toast({
        title: 'Could not send feedback',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const currentCat = CATEGORIES.find((c) => c.value === category)!;
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback to the dev team"
        data-testid="button-feedback-open"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-900/40 transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-black"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="feedback-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/55 backdrop-blur-sm p-3 sm:items-center sm:justify-center sm:p-4"
            onClick={() => !submitting && setOpen(false)}
            role="presentation"
          >
            <motion.div
              key="feedback-panel"
              initial={{ opacity: 0, y: 32, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
              data-testid="dialog-feedback"
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-title"
            >
              <div className="flex items-start justify-between border-b border-white/5 bg-gradient-to-br from-indigo-600/15 via-violet-600/10 to-transparent px-5 py-4">
                <div>
                  <h3 id="feedback-title" className="text-base font-semibold text-white">
                    Send feedback to the dev team
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    Saved straight to the database. Be specific — the dev team reads every entry in DevMode.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !submitting && setOpen(false)}
                  aria-label="Close feedback"
                  data-testid="button-feedback-close"
                  className="rounded-md p-1 text-zinc-400 transition hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    What kind of feedback?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map((c) => {
                      const Icon = c.icon;
                      const active = category === c.value;
                      return (
                        <motion.button
                          key={c.value}
                          type="button"
                          onClick={() => setCategory(c.value)}
                          data-testid={`button-feedback-category-${c.value}`}
                          whileTap={{ scale: 0.97 }}
                          className={`flex items-start gap-2 rounded-lg border bg-gradient-to-br p-3 text-left transition ${
                            active
                              ? c.accent
                              : 'border-white/10 from-white/[0.03] to-transparent text-zinc-300 hover:border-white/20'
                          }`}
                        >
                          <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium leading-tight">{c.label}</div>
                            <div className="mt-0.5 text-[11px] leading-snug opacity-75">{c.hint}</div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="feedback-message" className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                      Your message
                    </label>
                    <span className="text-[10px] text-zinc-500">
                      {message.length}/5000
                    </span>
                  </div>
                  <textarea
                    ref={textareaRef}
                    id="feedback-message"
                    data-testid="input-feedback-message"
                    required
                    rows={5}
                    maxLength={5000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={PLACEHOLDERS[category]}
                    className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm leading-relaxed text-white placeholder:whitespace-pre-line placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Tip: include the page, the steps, and what you expected — the more specific, the faster it gets fixed.
                  </p>
                </div>

                {!user && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                      Who is sending this? (optional)
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        data-testid="input-feedback-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <input
                        type="email"
                        data-testid="input-feedback-email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email so we can follow up"
                        className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-3">
                  <div className="min-w-0 text-[11px] text-zinc-500">
                    <span className="text-zinc-400">Page:</span>{' '}
                    <span className="font-mono text-zinc-300" title={currentPath}>
                      {currentPath || '/'}
                    </span>
                    <div className="mt-0.5 hidden sm:block">
                      Press <kbd className="rounded bg-white/10 px-1 text-zinc-300">⌘/Ctrl</kbd> +{' '}
                      <kbd className="rounded bg-white/10 px-1 text-zinc-300">Enter</kbd> to send
                    </div>
                  </div>
                  <motion.button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    data-testid="button-feedback-submit"
                    whileTap={{ scale: 0.97 }}
                    className={`inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50 ${currentCat ? '' : ''}`}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : justSent ? (
                      <>
                        <Check className="h-4 w-4" />
                        Sent
                      </>
                    ) : (
                      'Send to dev team'
                    )}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default FeedbackWidget;
