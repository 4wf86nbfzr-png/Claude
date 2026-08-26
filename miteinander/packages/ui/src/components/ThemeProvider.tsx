import React, { createContext, useContext, useMemo } from 'react';
import type { EffectivePreferences } from '@miteinander/core';
import { buildTheme, type Theme } from '../tokens/theme';

interface ThemeContextValue {
  theme: Theme;
  prefs: EffectivePreferences;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  prefs,
  children,
}: {
  prefs: EffectivePreferences;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ theme: buildTheme(prefs), prefs }), [prefs]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme muss innerhalb von ThemeProvider stehen.');
  return ctx.theme;
}

export function usePreferences(): EffectivePreferences {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('usePreferences muss innerhalb von ThemeProvider stehen.');
  return ctx.prefs;
}
