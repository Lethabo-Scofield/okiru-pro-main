/**
 * AutoFill Button - Admin-only floating button for test data.
 * Only renders for users with admin role.
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
import { useAuth } from "@toolkit/lib/auth";
import type { FoundationData } from "./build/FoundationStep";
import type { BuildPillarsData } from "./build/BuildPillarsStep";
import { getLakeTradingFoundationData, getLakeTradingPillarData } from "@/lib/lakeTradingDemo";
import { getTransportFoundationData, getTransportPillarData } from "@/lib/transportDemo";

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

export type DemoSector = 'lake_trading' | 'transport';

interface FillOption {
  id: AutoFillTarget;
  label: string;
  description: string;
  sectors: DemoSector[];
}

const FILL_OPTIONS: FillOption[] = [
  { id: 'foundation',   label: 'Foundation Layer',      description: 'Company info & financials', sectors: ['lake_trading', 'transport'] },
  { id: 'ownership',    label: 'Ownership',             description: '25/25 path (trust + new entrant)', sectors: ['lake_trading'] },
  { id: 'management',   label: 'Management Control',    description: '12 employees · Gauteng EAP', sectors: ['lake_trading'] },
  { id: 'skills',       label: 'Skills Development',    description: 'Training programs & learnerships', sectors: ['lake_trading', 'transport'] },
  { id: 'procurement',  label: 'Procurement',           description: 'Supplier spend & TMPS', sectors: ['lake_trading', 'transport'] },
  { id: 'esd',          label: 'Enterprise & Supplier', description: 'SD & ED contributions', sectors: ['lake_trading', 'transport'] },
  { id: 'sed',          label: 'Socio-Economic Dev',    description: 'SED grants & contributions', sectors: ['lake_trading', 'transport'] },
  { id: 'yes',          label: 'YES Initiative',        description: 'Youth employment data', sectors: ['lake_trading'] },
  { id: 'all',          label: 'Fill All Pillars',      description: 'Complete dataset', sectors: ['lake_trading', 'transport'] },
];

const SECTOR_OPTIONS: { id: DemoSector; label: string; description: string }[] = [
  { id: 'lake_trading', label: 'Lake Trading (RCOGP)', description: 'Retail - 7 pillars, ~63 pts' },
  { id: 'transport', label: 'Transport QSE', description: 'Transport - 4 pillars, 100 pts' },
];

interface AutoFillButtonProps {
  target: AutoFillTarget;
  onFill: (data: any, optionId: AutoFillTarget) => void;
  className?: string;
}

export function AutoFillButton({ target, onFill, className }: AutoFillButtonProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedSector, setSelectedSector] = useState<DemoSector>('lake_trading');

  // Only show for admin and super_admin users
  if (user?.role !== 'admin' && user?.role !== 'super_admin') return null;

  const handleFill = (optionId: AutoFillTarget) => {
    try {
      let data: any;

      if (selectedSector === 'transport') {
        const transportData = getTransportPillarData();
        switch (optionId) {
          case 'foundation':   data = getTransportFoundationData(); break;
          case 'skills':       data = transportData.skills; break;
          case 'procurement':  data = transportData.procurement; break;
          case 'esd':          data = transportData.esd; break;
          case 'sed':          data = transportData.sed; break;
          case 'all':          data = transportData; break;
          default:             data = transportData;
        }
      } else {
        const lakeData = getLakeTradingPillarData();
        switch (optionId) {
          case 'foundation':   data = getLakeTradingFoundationData(); break;
          case 'ownership':    data = lakeData.ownership; break;
          case 'management':   data = lakeData.management; break;
          case 'skills':       data = lakeData.skills; break;
          case 'procurement':  data = lakeData.procurement; break;
          case 'esd':          data = lakeData.esd; break;
          case 'sed':          data = lakeData.sed; break;
          case 'yes':          data = lakeData.yes; break;
          case 'all':          data = lakeData; break;
          default:             data = lakeData;
        }
      }

      onFill(data, optionId);
      const sectorLabel = SECTOR_OPTIONS.find(s => s.id === selectedSector)?.label;
      toast({
        title: "Test data loaded",
        description: `${sectorLabel} · ${FILL_OPTIONS.find(o => o.id === optionId)?.label}`,
        duration: 2000
      });
      setOpen(false);
    } catch (err) {
      toast({ title: "Failed to load test data", variant: "destructive" });
      console.error(err);
    }
  };

  const filteredOptions = FILL_OPTIONS.filter(opt =>
    opt.sectors.includes(selectedSector) &&
    (target === 'all' || target === 'foundation' || opt.id === target || opt.id === 'all')
  );

  const relevantOptions = target === 'all' || target === 'foundation'
    ? filteredOptions
    : filteredOptions.filter(o => o.id === target || o.id === 'all');

  const sectorLabel = SECTOR_OPTIONS.find(s => s.id === selectedSector)?.label;

  return (
    <div className={cn("fixed z-50 bottom-6 left-6", className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-2 bg-background border-border shadow-md hover:bg-muted text-xs font-medium"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Fill Test Data
            <ChevronUp className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64" sideOffset={6}>
          <DropdownMenuLabel className="text-xs font-medium">
            Sector / Dataset
          </DropdownMenuLabel>
          {SECTOR_OPTIONS.map((sector) => (
            <DropdownMenuItem
              key={sector.id}
              onClick={() => setSelectedSector(sector.id)}
              className={cn(
                "flex items-center justify-between py-2 text-sm cursor-pointer",
                selectedSector === sector.id && "font-medium bg-muted"
              )}
            >
              <span>{sector.label}</span>
              <span className="text-xs text-muted-foreground ml-2">{sector.description}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-xs font-medium">
            Data Options ({sectorLabel})
          </DropdownMenuLabel>
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
