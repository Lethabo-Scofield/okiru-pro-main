import React from "react";
import { Check } from "lucide-react";
import { useLocation } from "wouter";

export const SCORECARD_FLOW_STEPS = [
  { id: "company", label: "Company" },
  { id: "workbook", label: "Workbook" },
  { id: "summary", label: "Summary" },
] as const;

export type ScorecardFlowStepId = (typeof SCORECARD_FLOW_STEPS)[number]["id"];

export function scorecardFlowStepIndex(step: ScorecardFlowStepId): number {
  return SCORECARD_FLOW_STEPS.findIndex((s) => s.id === step);
}

export function scorecardFlowStepHref(step: ScorecardFlowStepId, companyId?: string): string {
  switch (step) {
    case "company":
      return "/create-scorecard";
    case "workbook":
      return `/create-scorecard/${encodeURIComponent(companyId ?? "")}`;
    case "summary":
      return `/create-scorecard/${encodeURIComponent(companyId ?? "")}/summary`;
  }
}

function resolveCurrentStep(location: string, companyId?: string): ScorecardFlowStepId {
  if (/\/summary\/?$/.test(location)) return "summary";
  if (companyId) return "workbook";
  return "company";
}

interface ScorecardFlowStepperProps {
  companyId?: string;
}

export function ScorecardFlowStepper({ companyId }: ScorecardFlowStepperProps) {
  const [location, navigate] = useLocation();
  const currentStep = resolveCurrentStep(location, companyId);
  const currentIdx = scorecardFlowStepIndex(currentStep);

  const goToStep = (step: ScorecardFlowStepId) => {
    navigate(scorecardFlowStepHref(step, companyId));
  };

  return (
    <div className="bg-black px-6 py-3" style={{ borderBottom: "1px solid #1c1c1e" }}>
      <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between">
        {SCORECARD_FLOW_STEPS.map((step, idx) => {
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
                data-testid={`flow-step-${step.id}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                    isComplete
                      ? "bg-white text-black group-hover:bg-[#d1d1d6]"
                      : isCurrent
                        ? "bg-white text-black"
                        : "bg-[#1c1c1e] text-[#48484a]"
                  }`}
                >
                  {isComplete ? <Check className="w-3 h-3" /> : idx + 1}
                </div>
                <span
                  className={`text-[13px] font-medium hidden sm:inline transition-colors ${
                    isComplete
                      ? "text-[#d1d1d6] group-hover:text-white"
                      : isCurrent
                        ? "text-white"
                        : "text-[#48484a]"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < SCORECARD_FLOW_STEPS.length - 1 && (
                <div className="flex-1 h-px mx-4" style={{ background: "#2c2c2e" }}>
                  <div
                    className="h-full transition-all duration-700"
                    style={{
                      width: isComplete ? "100%" : "0%",
                      background: "#636366",
                    }}
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
