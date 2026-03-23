import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, FileText, Building2, Layers, Rocket } from 'lucide-react';

const STORAGE_PREFIX = 'okiru-onboarding-complete';

function getStorageKey(userId?: string) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

interface TourStep {
  title: string;
  description: string;
  icon: typeof Sparkles;
  iconColor: string;
  iconBg: string;
  highlight?: string;
}

const steps: TourStep[] = [
  {
    title: "Welcome to Okiru",
    description: "Okiru helps you manage B-BBEE compliance for South African businesses. Let's take a quick tour of what you can do here.",
    icon: Rocket,
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/15",
  },
  {
    title: "Entity Templates",
    description: "Start by creating entity templates — these define what data to extract from your compliance documents. Use AI to generate entities or build them manually.",
    icon: Sparkles,
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/15",
    highlight: "card-create-entity",
  },
  {
    title: "Document Processor",
    description: "Upload PDFs, images, and other documents. Okiru will extract the data you need using your entity templates — no manual data entry required.",
    icon: FileText,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/15",
    highlight: "card-upload-docs",
  },
  {
    title: "Scorecards",
    description: "View your clients' B-BBEE scorecards, track compliance status, and drill into each pillar — Ownership, Skills, Procurement, and more.",
    icon: Building2,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/15",
    highlight: "card-scorecards",
  },
  {
    title: "You're all set!",
    description: "Start by browsing templates or uploading a document. You can always replay this tour from the help button in the header.",
    icon: Layers,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/15",
  },
];

export function useOnboarding(userId?: string) {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem(getStorageKey(userId));
      if (!done) setNeedsOnboarding(true);
    } catch {}
  }, [userId]);

  const startTour = useCallback(() => setShowTour(true), []);

  const completeTour = useCallback(() => {
    try { localStorage.setItem(getStorageKey(userId), 'true'); } catch {}
    setShowTour(false);
    setNeedsOnboarding(false);
  }, [userId]);

  const dismissTour = useCallback(() => {
    setShowTour(false);
  }, []);

  return { needsOnboarding, showTour, startTour, completeTour, dismissTour };
}

interface OnboardingWelcomeProps {
  onStart: () => void;
  onSkip: () => void;
  userName?: string;
}

export function OnboardingWelcome({ onStart, onSkip, userName }: OnboardingWelcomeProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const firstBtn = dialogRef.current?.querySelector('button');
    firstBtn?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onSkip]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'fadeIn 0.3s cubic-bezier(0.16,1,0.3,1)' }} data-testid="onboarding-welcome">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="onboarding-welcome-title" aria-describedby="onboarding-welcome-desc" className="relative w-full max-w-md mx-4 scale-in">
        <div className="rounded-3xl bg-[#1c1c1e] p-8 shadow-2xl" style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5)' }}>
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-400/10 ring-1 ring-purple-500/20 flex items-center justify-center mx-auto mb-6">
              <Rocket className="w-7 h-7 text-purple-400" />
            </div>
            <h2 id="onboarding-welcome-title" className="text-[22px] font-bold tracking-tight text-white mb-2">
              {userName ? `Welcome, ${userName.split(' ')[0]}!` : 'Welcome to Okiru!'}
            </h2>
            <p id="onboarding-welcome-desc" className="text-[14px] text-[#98989f] leading-relaxed mb-8">
              Your B-BBEE compliance platform is ready. Take a quick tour to learn how everything works, or jump right in.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={onStart}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-[14px] font-semibold smooth press-sm shadow-sm shadow-purple-500/20 flex items-center justify-center gap-2"
                data-testid="button-start-tour"
              >
                <Sparkles className="w-4 h-4" />
                Show me around
              </button>
              <button
                onClick={onSkip}
                className="w-full py-3 bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[#d1d1d6] rounded-2xl text-[14px] font-medium smooth press-sm"
                data-testid="button-skip-tour"
              >
                Skip for now
              </button>
            </div>

            <p className="text-[11px] text-[#636366] mt-5">
              You can restart the tour anytime from the <span className="text-[#98989f]">?</span> button.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OnboardingTourProps {
  onComplete: () => void;
  onDismiss: () => void;
}

export function OnboardingTour({ onComplete, onDismiss }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const Icon = step.icon;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step.highlight) {
      const el = document.querySelector(`[data-testid="${step.highlight}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('onboarding-highlight');
        return () => el.classList.remove('onboarding-highlight');
      }
    }
  }, [currentStep, step.highlight]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'ArrowRight') { if (!isLast) setCurrentStep(s => s + 1); else onComplete(); }
      if (e.key === 'ArrowLeft' && !isFirst) setCurrentStep(s => s - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFirst, isLast, onComplete, onDismiss]);

  const next = () => {
    if (isLast) { onComplete(); return; }
    setCurrentStep(s => s + 1);
  };
  const prev = () => setCurrentStep(s => Math.max(0, s - 1));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ animation: 'fadeIn 0.3s cubic-bezier(0.16,1,0.3,1)' }} data-testid="onboarding-tour">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onDismiss} />

      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tour-step-title" aria-describedby="tour-step-desc" className="relative w-full max-w-md mx-4 mb-6 sm:mb-0 scale-in" key={currentStep} style={{ animation: 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
        <div className="rounded-3xl bg-[#1c1c1e] overflow-hidden shadow-2xl" style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5)' }}>
          <div className="px-7 pt-7 pb-5">
            <div className="flex items-start justify-between mb-5">
              <div className={`w-12 h-12 rounded-2xl ${step.iconBg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${step.iconColor}`} />
              </div>
              <button onClick={onDismiss} className="p-1.5 text-[#636366] hover:text-white smooth rounded-lg hover:bg-[#2c2c2e]" aria-label="Close tour" data-testid="button-close-tour">
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 id="tour-step-title" className="text-[18px] font-bold tracking-tight text-white mb-2">{step.title}</h3>
            <p id="tour-step-desc" className="text-[14px] text-[#98989f] leading-relaxed">{step.description}</p>
          </div>

          <div className="px-7 pb-6 pt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={steps.length} aria-label={`Step ${currentStep + 1} of ${steps.length}`}>
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full smooth ${
                    i === currentStep ? 'w-5 bg-purple-500' : i < currentStep ? 'w-1.5 bg-purple-500/40' : 'w-1.5 bg-[#3a3a3c]'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button onClick={prev} className="p-2 text-[#8e8e93] hover:text-white smooth rounded-xl hover:bg-[#2c2c2e] press-sm" aria-label="Previous step" data-testid="button-tour-prev">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={next}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[13px] font-semibold smooth press-sm shadow-sm shadow-purple-500/20"
                data-testid="button-tour-next"
              >
                {isLast ? 'Get Started' : 'Next'}
                {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="h-1 bg-[#2c2c2e]">
            <div className="h-full bg-purple-500 smooth" style={{ width: `${((currentStep + 1) / steps.length) * 100}%`, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
