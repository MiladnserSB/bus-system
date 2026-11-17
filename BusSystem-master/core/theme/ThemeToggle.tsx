'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from '@/core/utils/cn';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle({
  label = 'تبديل المظهر',
  className,
}: {
  label?: string;
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();

  const handleClick = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-lg text-fg-muted transition-colors',
        'hover:bg-surface-muted hover:text-fg cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        className,
      )}
    >
      {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
