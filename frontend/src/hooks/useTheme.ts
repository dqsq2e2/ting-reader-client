import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { safeStorage } from '../utils/storage';

export type Theme = 'light' | 'dark' | 'system';

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (safeStorage.getItem('theme') as Theme) || 'system';
  });

  useEffect(() => {
    const applyToDom = (t: Theme) => {
      const root = window.document.documentElement;
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
      let effectiveTheme = t;
      if (t === 'system') {
        effectiveTheme = systemPrefersDark ? 'dark' : 'light';
        safeStorage.removeItem('theme');
      }
  
      root.classList.remove('light', 'dark');
      root.classList.add(effectiveTheme);
    };

    applyToDom(theme);
    safeStorage.setItem('theme', theme);

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

  const applyTheme = (t: Theme) => {
    setTheme(t);
  };

  const refreshTheme = async () => {
    try {
      const token = safeStorage.getItem('auth_token');
      if (!token || !navigator.onLine) return;

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
