'use client';
/**
 * Wraps next-themes for the App Router. `attribute="class"` toggles `.dark`
 * on <html>; `disableTransitionOnChange` prevents flash on theme switch.
 */
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
