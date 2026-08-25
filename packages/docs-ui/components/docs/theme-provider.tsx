'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = Exclude<Theme, 'system'>;

export function getAppearanceFromSearch(search: string): ResolvedTheme | undefined {
  const appearance = new URLSearchParams(search).get('appearance');
  return appearance === 'light' || appearance === 'dark' ? appearance : undefined;
}

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme | undefined;
  setTheme: (theme: Theme) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  disableTransitionOnChange?: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: undefined,
  setTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ResolvedTheme, disableTransition: boolean) {
  let transitionStyle: HTMLStyleElement | undefined;
  if (disableTransition) {
    transitionStyle = document.createElement('style');
    transitionStyle.textContent =
      '*,*::before,*::after{transition:none!important;animation-duration:0s!important}';
    document.head.appendChild(transitionStyle);
  }

  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
  document.documentElement.style.colorScheme = theme;

  if (transitionStyle) {
    window.getComputedStyle(document.body);
    window.setTimeout(() => transitionStyle.remove(), 1);
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>();
  const initializedTheme = useRef(false);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem('theme', nextTheme);
    } catch {}
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let activeTheme = theme;

    if (!initializedTheme.current) {
      initializedTheme.current = true;
      const appearance = getAppearanceFromSearch(window.location.search);
      let storedTheme: Theme | undefined;
      try {
        const storedValue = localStorage.getItem('theme');
        if (storedValue === 'light' || storedValue === 'dark' || storedValue === 'system') {
          storedTheme = storedValue;
        }
      } catch {}

      activeTheme = appearance ?? storedTheme ?? defaultTheme;
      if (activeTheme !== theme) setThemeState(activeTheme);
    }

    const updateTheme = () => {
      const nextTheme = activeTheme === 'system' ? getSystemTheme() : activeTheme;
      setResolvedTheme(nextTheme);
      applyTheme(nextTheme, disableTransitionOnChange);
    };

    updateTheme();
    media.addEventListener('change', updateTheme);
    return () => media.removeEventListener('change', updateTheme);
  }, [defaultTheme, disableTransitionOnChange, theme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [resolvedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
