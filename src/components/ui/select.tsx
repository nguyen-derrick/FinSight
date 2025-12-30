import * as React from 'react';
import { cn } from '@/lib/utils';

type Option = { value: string; label: React.ReactNode };

type SelectContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
  options: Option[];
  registerOption: (option: Option) => void;
  disabled?: boolean;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function Select({ value, onValueChange, children, disabled }: SelectProps) {
  const [options, setOptions] = React.useState<Option[]>([]);

  const registerOption = React.useCallback((option: Option) => {
    setOptions((prev) => {
      const exists = prev.some((o) => o.value === option.value);
      if (exists) return prev;
      return [...prev, option];
    });
  }, []);

  return <SelectContext.Provider value={{ value, onValueChange, options, registerOption, disabled }}>{children}</SelectContext.Provider>;
}

interface SelectTriggerProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SelectTrigger({ className, children, ...props }: SelectTriggerProps) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error('SelectTrigger must be used within Select');

  let placeholder: string | undefined;
  const iconNodes: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === SelectValue) {
      placeholder = child.props.placeholder;
    } else if (child !== null) {
      iconNodes.push(child);
    }
  });

  return (
    <div className={cn('relative', className)} {...props}>
      {iconNodes.length > 0 ? (
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{iconNodes}</div>
      ) : null}
      <select
        className={cn(
          'h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          iconNodes.length > 0 ? 'pl-9' : '',
          'appearance-none'
        )}
        value={ctx.value ?? ''}
        disabled={ctx.disabled}
        onChange={(e) => ctx.onValueChange?.(e.target.value)}
      >
        {placeholder ? (
          <option value="" disabled={false} hidden={false}>
            {placeholder}
          </option>
        ) : null}
        {ctx.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label as any}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
    </div>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return <>{placeholder}</>;
}

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SelectContent({ children }: SelectContentProps) {
  return <div className="hidden">{children}</div>;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
}

export function SelectItem({ value, children }: SelectItemProps) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error('SelectItem must be used within Select');

  React.useEffect(() => {
    ctx.registerOption({ value, label: children });
  }, [ctx, value, children]);

  return null;
}
