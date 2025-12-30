import * as React from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from './ui/tooltip';
import { cn } from '@/lib/utils';

type MetricInfoProps = {
  title: string;
  definition: string;
  formula: string;
  className?: string;
};

export function MetricInfo({ title, definition, formula, className }: MetricInfoProps) {
  return (
    <Tooltip
      content={
        <div className="max-w-xs space-y-1 text-left">
          <div className="text-xs font-semibold">{title}</div>
          <p className="text-xs text-muted-foreground">{definition}</p>
          <p className="text-[11px] text-muted-foreground/90">Formula: {formula}</p>
        </div>
      }
      className={cn('align-middle', className)}
    >
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`${title} details`}
      >
        <Info className="h-3 w-3" />
      </button>
    </Tooltip>
  );
}
