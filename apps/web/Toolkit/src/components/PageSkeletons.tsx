import { Skeleton } from "@toolkit/components/ui/skeleton";

export function ScorecardSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl" data-testid="scorecard-skeleton">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-40 mb-1.5" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      </div>

      <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
        <div className="grid grid-cols-6 gap-px bg-muted/20 p-3 border-b">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} className="grid grid-cols-6 gap-4 p-3 border-b border-border/20 items-center">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        ))}
        <div className="grid grid-cols-6 gap-4 p-3 bg-muted/10 items-center">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>

      <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PillarPageSkeleton({ title }: { title?: string }) {
  return (
    <div className="space-y-6 max-w-5xl" data-testid="pillar-skeleton">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-48 mb-1.5" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-border/30 bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/30 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-4 py-2 border-b border-border/20">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="grid grid-cols-6 gap-4 py-3 border-b border-border/10">
              {[1, 2, 3, 4, 5, 6].map(j => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex justify-between items-center py-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-8 max-w-5xl" data-testid="reports-skeleton">
      <div>
        <Skeleton className="h-8 w-48 mb-1.5" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-border/30 bg-card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-56" />
        <div className="space-y-2 mt-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="grid grid-cols-4 gap-4 py-3 border-b border-border/10">
              <Skeleton className="h-4 w-full col-span-2" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScenariosSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl" data-testid="scenarios-skeleton">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-36 mb-1.5" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      <div className="rounded-xl border border-border/30 bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map(i => (
          <div key={i} className="rounded-xl border border-border/30 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(j => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl" data-testid="settings-skeleton">
      <div>
        <Skeleton className="h-7 w-28 mb-1.5" />
        <Skeleton className="h-4 w-56" />
      </div>

      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border border-border/30 bg-card p-5 space-y-4">
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <div className="flex items-center justify-between py-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
