'use client';
/**
 * Sun/moon button — cycles `light → dark → system`.
 * Mounted check avoids the SSR/CSR icon mismatch (next-themes pattern).
 */
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ORDER = ['light', 'dark', 'system'] as const;
type Mode = (typeof ORDER)[number];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Canonical next-themes hydration guard: the only signal we need is "has the
  // component hydrated yet?", which is exactly what a one-shot effect provides.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // During SSR / first paint render a neutral placeholder so the layout
  // doesn't shift when the real icon swaps in.
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Cambiar tema" disabled>
        <SunIcon />
      </Button>
    );
  }

  const current: Mode = (ORDER as readonly string[]).includes(theme ?? '')
    ? (theme as Mode)
    : 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  const Icon = current === 'light' ? SunIcon : current === 'dark' ? MoonIcon : MonitorIcon;
  const label =
    current === 'light' ? 'Tema claro' : current === 'dark' ? 'Tema oscuro' : 'Tema del sistema';

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next)}
      aria-label={`${label}. Cambiar a ${next}.`}
      title={label}
    >
      <Icon />
    </Button>
  );
}
