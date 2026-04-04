import { create } from 'zustand';
import type { User } from '../types';
import { safeStorage } from '../utils/storage';

interface AuthState {
  user: User | null;
  token: string | null;
  serverUrl: string; // The original URL input by user
  activeUrl: string; // The resolved URL (after redirect)
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setServerUrl: (url: string) => void;
  setActiveUrl: (url: string) => void;
  logout: () => void;
}

type WindowWithElectron = Window & { electronAPI?: unknown };

const isElectron = typeof window !== 'undefined' && !!(window as WindowWithElectron).electronAPI;
const defaultServerUrl = isElectron ? '' : (import.meta.env.PROD ? window.location.origin : 'http://localhost:3000');

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(safeStorage.getItem('user') || 'null'),
  token: safeStorage.getItem('auth_token'),
  serverUrl: safeStorage.getItem('server_url') || defaultServerUrl,
  activeUrl: safeStorage.getItem('active_url') || safeStorage.getItem('server_url') || defaultServerUrl,
  isAuthenticated: !!safeStorage.getItem('auth_token'),
  setAuth: (user, token) => {
    safeStorage.setItem('auth_token', token);
    safeStorage.setItem('user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },
  setUser: (user) => {
    safeStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },
  setToken: (token) => {
    safeStorage.setItem('auth_token', token);
    set({ token, isAuthenticated: true });
  },
  setServerUrl: (url) => {
    safeStorage.setItem('server_url', url);
    set({ serverUrl: url });
  },
  setActiveUrl: (url) => {
    safeStorage.setItem('active_url', url);
    set({ activeUrl: url });
  },
  logout: () => {
    safeStorage.removeItem('auth_token');
    safeStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
