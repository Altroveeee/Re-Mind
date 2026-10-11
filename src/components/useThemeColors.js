import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { resolveTheme } from './nodeColors';

// Colori del tema attivo (chiaro, scuro o personalizzato).
export function useResolvedTheme() {
  const theme = useStore((s) => s.theme);
  const customThemes = useStore((s) => s.customThemes);
  return useMemo(() => resolveTheme(theme, customThemes), [theme, customThemes]);
}

// Palette dei nodi del tema attivo: [{ name, value }]
export const useNodeColors = () => useResolvedTheme().nodeColors;
