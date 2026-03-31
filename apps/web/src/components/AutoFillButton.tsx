/**
 * AutoFill Button - Dev-only floating button for test data.
 * Only renders outside of production.
 */

import React, { useState } from 'react';
import { Button } from "@toolkit/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@toolkit/components/ui/dropdown-menu";
import { Wand2, ChevronUp } from "lucide-react";
import { cn } from "@toolkit/lib/utils";
import { useToast } from "@toolkit/hooks/use-toast";
import type { FoundationData } from "./build/FoundationStep";
import type { BuildPillarsData } from "./build/BuildPillarsStep";
import { getLakeTradingFoundationData, getLakeTradingPillarData } from "@/lib/lakeTradingDemo";

export type AutoFillTarget =
  | 'foundation'
  | 'ownership'
  | 'management'
  | 'skills'
  | 'procurement'
  | 'esd'
  | 'sed'
  | 'yes'
  | 'all';

const FILL_OPTIONS: { id: AutoFillTarget; label: string; description: string }[] = [
  { id: 'foundation',   label: 'Foundation Layer',      description: 'Silver Lake 447 · Excel financials' },
  { id: 'ownership',    label: 'Ownership',             description: '25/25 path (trust + new entrant)' },
  { id: 'management',   label: 'Management Control',    description: '12 employees · Gauteng EAP' },
  { id: 'skills',       label: 'Skills Development',    description: 'No training (Excel / 0 pts)' },
  { id: 'procurement',  label: 'Procurement',           description: '2 suppliers · TMPS from toolkit' },
  { id: 'esd',          label: 'Enterprise & Supplier', description: 'SD R250k + ED R160k direct cost' },
  { id: 'sed',          label: 'Socio-Economic Dev',    description: 'Grant R27.5k' },
  { id: 'yes',          label: 'YES Initiative',        description: 'Empty (no youth rows)' },
  { id: 'all',          label: 'Fill All Pillars',      description: '~63.56 pts · L7 / disc. L8' },
];

interface AutoFillButtonProps {
  target: AutoFillTarget;
  onFill: (data: any, optionId: AutoFillTarget) => void;
  className?: string;
}

export function AutoFillButton({ target, onFill, className }: AutoFillButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV === 'production') return null;

  const handleFill = (optionId: AutoFillTarget) => {
    try {
      const all = getLakeTradingPillarData();
      let data: any;
      switch (optionId) {
        case 'foundation':   data = getLakeTradingFoundationData(); break;
        case 'ownership':    data = all.ownership; break;
        case 'management':   data = all.management; break;
        case 'skills':       data = all.skills; break;
        case 'procurement':  data = all.procurement; break;
        case 'esd':          data = all.esd; break;
        case 'sed':          data = all.sed; break;
        case 'yes':          data = all.yes; break;
        case 'all':          data = all; break;
        default:             data = all;
      }
      onFill(data, optionId);
      toast({ title: "Test data loaded", description: `Silver Lake demo · ${FILL_OPTIONS.find(o => o.id === optionId)?.label}`, duration: 2000 });
      setOpen(false);
    } catch (err) {
      toast({ title: "Failed to load test data", variant: "destructive" });
      console.error(err);
    }
  };

  const relevantOptions = target === 'all' || target === 'foundation'
    ? FILL_OPTIONS
    : FILL_OPTIONS.filter(o => o.id === target || o.id === 'all');

  return (
    <div className={cn("fixed z-50 bottom-6 right-6", className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-2 bg-background border-border shadow-md hover:bg-muted text-xs font-medium"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Dev: Fill Data
            <ChevronUp className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" sideOffset={6}>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Lake Trading (Pty) Ltd — test data
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {relevantOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.id}
              onClick={() => handleFill(opt.id)}
              className={cn(
                "flex items-center justify-between py-2 text-sm cursor-pointer",
                opt.id === target && "font-medium"
              )}
            >
              <span>{opt.label}</span>
              <span className="text-xs text-muted-foreground ml-3">{opt.description}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function DevModeBadge() {
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <div className="fixed bottom-6 left-6 z-40 pointer-events-none">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/60 bg-background/80 border border-border/40 px-2 py-1 rounded">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500/70" />
        dev
      </span>
    </div>
  );
}

export default AutoFillButton;
