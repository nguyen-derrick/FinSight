import * as React from 'react';
import { cn } from '@/lib/utils';

type PopoverProps = {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
};

export function Popover({ content, children, className }: PopoverProps) {
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
          className="pointer-events-none absolute left-0 z-50 mt-2 min-w-[200px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
