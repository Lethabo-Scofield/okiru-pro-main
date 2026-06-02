import React from "react";
import { Check } from "lucide-react";
import { useLocation } from "wouter";
import { ESG_FLOW_STEPS, type EsgFlowStepId, esgFlowStepHref } from "@/lib/esgRoutes";

function resolveCurrentStep(location: string, companyId?: string): EsgFlowStepId {
  if (/\/summary\/?$/.test(location)) return "summary";
  if (companyId && location.includes("/esg/create/")) return "inputs";
  return "company";
}

function esgFlowStepIndex(step: EsgFlowStepId): number {
  return ESG_FLOW_STEPS.findIndex((s) => s.id === step);
}

interface EsgFlowStepperProps {
  companyId?: string;
}

export function EsgFlowStepper({ companyId }: EsgFlowStepperProps) {
  const [location, navigate] = useLocation();
  const currentStep = resolveCurrentStep(location, companyId);
  const currentIdx = esgFlowStepIndex(currentStep);

  const goToStep = (step: EsgFlowStepId) => {
    navigate(esgFlowStepHref(step, companyId));
  };

  return (
    <div className="px-6 py-3 border-b border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.85)] backdrop-blur-xl">
      <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between">
        {ESG_FLOW_STEPS.map((step, idx) => {
          const isComplete = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const canNavigate = isComplete;

          return (
            <React.Fragment key={step.id}>
              <div
                className={`flex items-center gap-2 ${canNavigate ? "cursor-pointer group" : ""}`}
                onClick={() => {
                  if (canNavigate) goToStep(step.id);
                }}
                role={canNavigate ? "button" : undefined}
                tabIndex={canNavigate ? 0 : undefined}
                onKeyDown={(e) => {
                  if (canNavigate && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    goToStep(step.id);
                  }
                }}
                data-testid={`esg-flow-step-${step.id}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                    isComplete
                      ? "bg-[var(--esg-acc-e)] text-[#080e14] group-hover:opacity-90"
                      : isCurrent
                        ? "bg-white text-black"
                        : "bg-white/[0.06] text-[var(--esg-text3)]"
                  }`}
                >
                  {isComplete ? <Check className="w-3 h-3" /> : idx + 1}
                </div>
                <span
                  className={`text-[13px] font-medium hidden sm:inline transition-colors ${
                    isComplete
                      ? "text-[var(--esg-text2)] group-hover:text-[var(--esg-text)]"
                      : isCurrent
                        ? "text-[var(--esg-text)]"
                        : "text-[var(--esg-text3)]"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < ESG_FLOW_STEPS.length - 1 && (
                <div className="flex-1 h-px mx-4 bg-[var(--esg-glass-border)]">
                  <div
                    className="h-full transition-all duration-700 bg-[var(--esg-acc-e)]/40"
                    style={{ width: isComplete ? "100%" : "0%" }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
