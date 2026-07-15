/**
 * Mode Chooser Component
 *
 * Entry point for DocumentProcessor — two ways to start a scorecard:
 * upload your evidence documents (preset expected-documents flow, parser
 * classified) or build the scorecard manually pillar by pillar.
 */

import { Building2, Files, ArrowRight } from 'lucide-react';

export type ProcessorMode = 'upload' | 'documents' | 'build';

interface ModeChooserProps {
  onSelectMode: (mode: ProcessorMode) => void;
}

export function ModeChooser({ onSelectMode }: ModeChooserProps) {
  return (
    <div className="w-full max-w-2xl mx-auto py-12">
      <div className="text-center mb-10">
        <h2 className="text-2xl font-bold text-white mb-2">
          How would you like to proceed?
        </h2>
        <p className="text-[#8e8e93] text-sm">
          Choose how you want to create your B-BBEE scorecard
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upload documents (preset expected-documents flow) */}
        <button
          onClick={() => onSelectMode('documents')}
          className="group relative p-6 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e] hover:border-[#bf5af2]/50 hover:bg-[#1c1c1e]/80 transition-all duration-200 text-left"
          data-testid="mode-upload-documents"
        >
          <div className="w-12 h-12 rounded-xl bg-[#bf5af2]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Files className="w-6 h-6 text-[#bf5af2]" />
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">
            Upload Documents
          </h3>

          <p className="text-[13px] text-[#8e8e93] mb-4 leading-relaxed">
            Drop your evidence — B-BBEE certificates, affidavits, spend
            schedules, EE reports, or your toolkit workbook (PDF, Word, Excel).
            We classify each document against the expected checklist, extract
            what's needed and show your approximate score.
          </p>

          <div className="flex items-center gap-2 text-[#bf5af2] text-sm font-medium">
            <span>Get started</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Build Option */}
        <button
          onClick={() => onSelectMode('build')}
          className="group relative p-6 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e] hover:border-emerald-500/50 hover:bg-[#1c1c1e]/80 transition-all duration-200 text-left"
          data-testid="mode-build"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Building2 className="w-6 h-6 text-emerald-400" />
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">
            Build Manually
          </h3>

          <p className="text-[13px] text-[#8e8e93] mb-4 leading-relaxed">
            Enter your B-BBEE data pillar by pillar. Best when you don't
            have documents at hand or want to explore scenarios.
          </p>

          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <span>Get started</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      {/* Hint */}
      <p className="text-center text-[12px] text-[#636366] mt-6">
        Use Back on any step to return here and pick the other path. Build progress is saved in this browser.
      </p>
    </div>
  );
}
