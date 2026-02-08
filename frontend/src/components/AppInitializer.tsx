import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Loader2 } from 'lucide-react';
import logoImg from '../assets/logo.png';

interface AppInitializerProps {
  children: React.ReactNode;
}

const AppInitializer: React.FC<AppInitializerProps> = ({ children }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [statusMessage, setStatusMessage] = useState('正在启动...');
  const { setAuth, setActiveUrl, setServerUrl } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  useEffect(() => {
    const initializeApp = async () => {
      // Only run auto-login logic in Electron environment
      // For Web environment, we rely on the persisted token in authStore (handled by zustand persist logic)
      if (!isElectron) {
        setIsInitializing(false);
        return;
      }

      // Check if we have saved credentials
      const savedUsername = localStorage.getItem('saved_username');
      const savedPassword = localStorage.getItem('saved_password');
      const serverUrl = localStorage.getItem('server_url');

      // If we are already on the login page, skip auto-login
      if (location.pathname === '/login') {
        setIsInitializing(false);
        return;
      }

      // If no credentials or no server URL, we can't auto-login
      if (!savedUsername || !savedPassword || !serverUrl) {
        setIsInitializing(false);
        return;
      }

      try {
        setStatusMessage('正在连接服务器...');
        console.log('Attempting auto-login with stored credentials...');

        // Perform login request using the SOURCE serverUrl
        // This bypasses the potentially stale 'active_url' and token
        const loginUrl = `${serverUrl}/api/auth/login`;
        
        // We use fetch directly to avoid apiClient interceptors for this initial handshake
        let response = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: savedUsername, password: savedPassword })
        });

        // Handle redirect (similar to LoginPage logic)
        if (response.redirected) {
          try {
            console.log('Auto-login: Redirect detected to', response.url);
            const baseUrl = response.url.replace(/\/api\/auth\/login\/?$/, '');
            setActiveUrl(baseUrl);
          } catch (e) {
            console.error('Auto-login: Failed to parse redirect URL', e);
          }
        }

        // Handle 404/Method Not Allowed caused by 302 redirect turning POST into GET
        if (!response.ok && response.status === 404 && response.redirected) {
          setStatusMessage('重定向中...');
          console.log('Auto-login: Retrying POST to new location:', response.url);
          response = await fetch(response.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: savedUsername, password: savedPassword })
          });
          
          if (response.ok) {
             const baseUrl = response.url.replace(/\/api\/auth\/login\/?$/, '');
             setActiveUrl(baseUrl);
          }
        }

        if (response.ok) {
          const data = await response.json();
          const { token, user } = data;
          
          // Login successful!
          setStatusMessage('登录成功，正在进入...');
          setAuth(user, token);
          
          // Ensure serverUrl is set (it should be, but just in case)
          setServerUrl(serverUrl);
          
          // Allow the app to render
          setIsInitializing(false);
        } else {
          // Login failed (e.g., password changed, server error)
          console.warn('Auto-login failed:', response.status, response.statusText);
          // We don't clear credentials here, just let the user go to login page
          // But we should probably clear the auth state to force re-login UI
          // useAuthStore.getState().logout(); // Optional: maybe too aggressive?
          
          setIsInitializing(false);
          navigate('/login');
        }
      } catch (err) {
        console.error('Auto-login error:', err);
        // Network error or other issue
        // Fallback to login page
        setIsInitializing(false);
        navigate('/login');
      }
    };

    initializeApp();
  }, [isElectron, location.pathname, navigate, setActiveUrl, setAuth, setServerUrl]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
          <div className="w-20 h-20 relative">
             <div className="absolute inset-0 bg-primary-100 dark:bg-primary-900/30 rounded-full animate-ping opacity-75"></div>
             <div className="relative z-10 w-full h-full bg-white dark:bg-slate-900 rounded-full shadow-xl flex items-center justify-center border border-slate-100 dark:border-slate-800">
               <img src={logoImg} alt="Logo" className="w-12 h-12 object-contain" />
             </div>
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Ting Reader</h2>
            <div className="flex items-center justify-center gap-2 text-primary-600 dark:text-primary-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm font-medium">{statusMessage}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AppInitializer;
