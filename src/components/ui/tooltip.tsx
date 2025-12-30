import * as React from 'react';
import { cn } from '@/lib/utils';

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
};

export function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();

  const trigger = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      setOpen(true);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      setOpen(false);
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      setOpen(true);
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      setOpen(false);
    },
    'aria-describedby': open ? id : undefined,
  });

  return (
    <span className={cn('relative inline-flex', className)}>
      {trigger}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute left-1/2 z-50 mt-2 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
          style={{ minWidth: 180 }}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
