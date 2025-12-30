import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';

type Theme = 'light' | 'dark';

type ThemeToggleProps = {
  theme: Theme;
  onToggle: (theme: Theme) => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const label = theme === 'dark' ? 'Dark' : 'Light';

  return (
    <Button
      type="button"
      variant="secondary"
      className="rounded-2xl"
      onClick={() => onToggle(nextTheme)}
      aria-pressed={theme === 'dark'}
      aria-label={`Switch to ${nextTheme} mode`}
    >
      {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="hidden sm:inline">{label} mode</span>
    </Button>
  );
}
