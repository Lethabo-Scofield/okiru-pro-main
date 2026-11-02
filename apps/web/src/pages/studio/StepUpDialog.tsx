import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { explainError, stepUpStart, stepUpVerify, studio } from '@/lib/studioApi';

interface Props {
  open: boolean;
  /** 'publish' | 'freeze' | 'unfreeze' | 'emergency-rollback' */
  action: string;
  params: Record<string, unknown>;
  title: string;
  onCancel: () => void;
  /** Receives the single-use token, bound by the server to exactly this action. */
  onToken: (token: string) => void | Promise<void>;
}

/**
 * Asks for a fresh authenticator code for ONE specific action. If the user has not enrolled an
 * authenticator yet it walks them through enrolment first (secret shown once).
 */
export function StepUpDialog({ open, action, params, title, onCancel, onToken }: Props) {
  const [phase, setPhase] = useState<'starting' | 'enrol' | 'code'>('starting');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const begin = async () => {
    setError(''); setCode(''); setPhase('starting');
    try {
      const c = await stepUpStart(action, params);
      setChallengeId(c.challengeId); setPhase('code');
    } catch (e: any) {
      if (/Enrol an authenticator/i.test(e?.message ?? '')) setPhase('enrol'); else setError(explainError(e));
    }
  };
  useEffect(() => { if (open) void begin(); }, [open]);

  const enrol = async () => {
    setBusy(true); setError('');
    try { const r = await studio<{ secret: string }>('POST', '/api/auth/step-up/enroll'); setSecret(r.secret); } catch (e) { setError(explainError(e)); }
    setBusy(false);
  };
  const confirmEnrol = async () => {
    setBusy(true); setError('');
    try { await studio('POST', '/api/auth/step-up/confirm', { code }); setSecret(''); await begin(); } catch (e) { setError(explainError(e)); }
    setBusy(false);
  };
  const submit = async () => {
    setBusy(true); setError('');
    try { const { token } = await stepUpVerify(challengeId, code.trim()); await onToken(token); } catch (e) { setError(explainError(e)); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>This action needs a fresh code from your authenticator app. The code is good for this action only.</DialogDescription>
        </DialogHeader>
        {phase === 'enrol' && (
          <div className="space-y-3 text-sm">
            <p>Set up an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password...). It works without email.</p>
            {!secret ? <Button onClick={enrol} disabled={busy}>Generate my secret</Button> : (
              <>
                <p>Add this key in your app (shown once), then enter the 6-digit code:</p>
                <code className="block break-all rounded bg-zinc-100 p-2 font-mono text-sm" data-testid="totp-secret">{secret}</code>
                <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Authenticator code" />
                <Button onClick={confirmEnrol} disabled={busy || code.length !== 6}>Confirm and continue</Button>
              </>
            )}
          </div>
        )}
        {phase === 'code' && (
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Authenticator code" onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) void submit(); }} />
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          {phase === 'code' && <Button onClick={submit} disabled={busy || code.length !== 6}>Confirm</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
