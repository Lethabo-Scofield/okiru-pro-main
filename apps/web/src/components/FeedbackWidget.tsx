import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquarePlus, X, Loader2, Check } from 'lucide-react';
import { useAuth } from '@toolkit/lib/auth';
import { apiRequest } from '@toolkit/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const HIDDEN_PATHS = ['/devmode'];

type Category = 'bug' | 'feature' | 'general' | 'compliance';

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Idea' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'general', label: 'Other' },
];

const PLACEHOLDERS: Record<Category, string> = {
  bug: 'What did you do, what did you expect, what happened?',
  feature: 'What problem would this solve?',
  compliance: 'Which calculation or rule, and what should change?',
  general: 'Tell us anything that would help.',
};

const formFontStyle: React.CSSProperties = {
  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
  fontFeatureSettings: '"cv11", "ss01"',
  letterSpacing: '-0.005em',
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
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        style={formFontStyle}
        className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-medium text-zinc-900 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] ring-1 ring-black/5 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-black"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={2.25} />
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
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:justify-center sm:p-4"
            onClick={() => !submitting && setOpen(false)}
            role="presentation"
          >
            <motion.div
              key="feedback-panel"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              style={formFontStyle}
              className="w-full max-w-[440px] overflow-hidden rounded-xl bg-white text-zinc-900 shadow-2xl ring-1 ring-black/5"
              data-testid="dialog-feedback"
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-title"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
                <h3 id="feedback-title" className="text-[14px] font-semibold tracking-tight text-zinc-900">
                  Send feedback
                </h3>
                <button
                  type="button"
                  onClick={() => !submitting && setOpen(false)}
                  aria-label="Close feedback"
                  data-testid="button-feedback-close"
                  className="-mr-1.5 rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-5 py-4">
                <div className="mb-4">
                  <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5">
                    {CATEGORIES.map((c) => {
                      const active = category === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setCategory(c.value)}
                          data-testid={`button-feedback-category-${c.value}`}
                          className={`relative rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                            active ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="feedback-cat-pill"
                              className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-black/[0.04]"
                              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                            />
                          )}
                          <span className="relative">{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-4">
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
                    style={formFontStyle}
                    className="block w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-0"
                  />
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">
                      Page <span className="font-mono text-zinc-500">{currentPath || '/'}</span>
                    </span>
                    <span className="text-[11px] text-zinc-400">{message.length}/5000</span>
                  </div>
                </div>

                {!user && (
                  <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      data-testid="input-feedback-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Name"
                      style={formFontStyle}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-0"
                    />
                    <input
                      type="email"
                      data-testid="input-feedback-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      style={formFontStyle}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-0"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="hidden text-[11px] text-zinc-400 sm:block">
                    <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-px font-mono text-[10px] text-zinc-500">⌘</kbd>{' '}
                    <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-px font-mono text-[10px] text-zinc-500">↵</kbd>{' '}
                    to send
                  </span>
                  <motion.button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    data-testid="button-feedback-submit"
                    whileTap={{ scale: 0.97 }}
                    style={formFontStyle}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                        Saving
                      </>
                    ) : justSent ? (
                      <>
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        Sent
                      </>
                    ) : (
                      'Send'
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
