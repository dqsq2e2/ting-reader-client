import { useEffect, useState } from 'react';
import apiClient from '../api/client';

export type Theme = 'light' | 'dark' | 'system';

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'system';
  });

  const applyTheme = (t: Theme) => {
    setTheme(t);
  };

  useEffect(() => {
    const root = window.document.documentElement;
    const applyToDom = (t: Theme) => {
      root.classList.remove('light', 'dark');

      let effectiveTheme = t;
      if (t === 'system') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      root.classList.add(effectiveTheme);
    };

    applyToDom(theme);
    localStorage.setItem('theme', theme);

    // Listen for system theme changes if set to system
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyToDom('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const refreshTheme = async () => {
    // Skip if offline or no token
    const token = localStorage.getItem('auth_token');
    if (!token || !navigator.onLine) return;

    try {
      const response = await apiClient.get('/api/settings');
      if (response.data.theme) {
        applyTheme(response.data.theme);
      }
    } catch {
      // console.error('Failed to refresh theme from server', err);
    }
  };

  return { theme, applyTheme, refreshTheme };
};
