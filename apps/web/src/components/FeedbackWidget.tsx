import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { MessageSquarePlus, X, Loader2, Check } from 'lucide-react';
import { useAuth } from '@toolkit/lib/auth';
import { apiRequest } from '@toolkit/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const HIDDEN_PATHS = ['/devmode'];

type Category = 'bug' | 'feature' | 'general' | 'compliance';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'compliance', label: 'Compliance' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature request' },
  { value: 'general', label: 'General' },
];

export function FeedbackWidget() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<Category>('compliance');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justSent, setJustSent] = useState(false);

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting]);

  if (HIDDEN_PATHS.some(p => location.startsWith(p))) {
    return null;
  }

  const reset = () => {
    setMessage('');
    setCategory('compliance');
    setJustSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        title: 'Feedback sent',
        description: 'Thanks — the dev team will see this in DevMode.',
      });
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1200);
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback to the dev team"
        data-testid="button-feedback-open"
        className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-black"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-end bg-black/40 p-4 sm:items-center sm:justify-center"
          onClick={() => !submitting && setOpen(false)}
          role="presentation"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
            data-testid="dialog-feedback"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 id="feedback-title" className="text-base font-semibold text-white">Send feedback</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Compliance team notes go straight to the dev team.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setOpen(false)}
                aria-label="Close feedback"
                data-testid="button-feedback-close"
                className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      data-testid={`button-feedback-category-${c.value}`}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        category === c.value
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300" htmlFor="feedback-message">
                  Your feedback
                </label>
                <textarea
                  id="feedback-message"
                  data-testid="input-feedback-message"
                  required
                  rows={4}
                  maxLength={5000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's working? What needs fixing?"
                  className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="mt-1 text-right text-[10px] text-zinc-500">
                  {message.length}/5000
                </div>
              </div>

              {!user && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    data-testid="input-feedback-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name (optional)"
                    className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="email"
                    data-testid="input-feedback-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] text-zinc-500">
                  {typeof window !== 'undefined' ? window.location.pathname : ''}
                </span>
                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  data-testid="button-feedback-submit"
                  className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                    'Save feedback'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default FeedbackWidget;
