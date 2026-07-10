/**
 * Mode Chooser Component
 *
 * Entry point for DocumentProcessor - lets user choose between uploading the
 * integrated toolkit workbook, uploading raw source documents (parser-assisted),
 * or building a scorecard manually.
 */

import { FileText, Building2, Files, ArrowRight } from 'lucide-react';

export type ProcessorMode = 'upload' | 'documents' | 'build';

interface ModeChooserProps {
  onSelectMode: (mode: ProcessorMode) => void;
}

export function ModeChooser({ onSelectMode }: ModeChooserProps) {
  return (
    <div className="w-full max-w-4xl mx-auto py-12">
      <div className="text-center mb-10">
        <h2 className="text-2xl font-bold text-white mb-2">
          How would you like to proceed?
        </h2>
        <p className="text-[#8e8e93] text-sm">
          Choose how you want to create your B-BBEE scorecard
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Toolkit workbook upload */}
        <button
          onClick={() => onSelectMode('upload')}
          className="group relative p-6 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e] hover:border-[#5e9bff]/50 hover:bg-[#1c1c1e]/80 transition-all duration-200 text-left"
          data-testid="mode-upload-workbook"
        >
          <div className="w-12 h-12 rounded-xl bg-[#5e9bff]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <FileText className="w-6 h-6 text-[#5e9bff]" />
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">
            Upload Toolkit Workbook
          </h3>

          <p className="text-[13px] text-[#8e8e93] mb-4 leading-relaxed">
            Import one integrated B-BBEE toolkit / scorecard workbook (Excel).
            We map its standard columns across all pillars.
          </p>

          <div className="flex items-center gap-2 text-[#5e9bff] text-sm font-medium">
            <span>Get started</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Raw source documents upload (parser-assisted) */}
        <button
          onClick={() => onSelectMode('documents')}
          className="group relative p-6 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e] hover:border-[#bf5af2]/50 hover:bg-[#1c1c1e]/80 transition-all duration-200 text-left"
          data-testid="mode-upload-documents"
        >
          <div className="w-12 h-12 rounded-xl bg-[#bf5af2]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Files className="w-6 h-6 text-[#bf5af2]" />
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">
            Upload Source Documents
          </h3>

          <p className="text-[13px] text-[#8e8e93] mb-4 leading-relaxed">
            Drop the raw evidence — B-BBEE certificates, affidavits, spend
            schedules, EE reports (PDF, Word, Excel). We classify each document,
            extract what's needed and show your approximate score.
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
            have a toolkit file or want to explore scenarios.
          </p>

          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <span>Get started</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      {/* Hint */}
      <p className="text-center text-[12px] text-[#636366] mt-6">
        Use Back on any step to return here and pick another path. Build progress is saved in this browser.
      </p>
    </div>
  );
}
