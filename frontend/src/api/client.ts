import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Initial base URL
const API_BASE_URL = localStorage.getItem('active_url') || localStorage.getItem('server_url') || (import.meta.env.PROD ? '' : 'http://localhost:3000');

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const { token, activeUrl } = useAuthStore.getState();

  // Offline Mode Check
  // If we are on the downloads page, we should block API requests to avoid errors
  // EXCEPT for requests to local proxy or non-api endpoints if any
  const isOffline = !navigator.onLine;
  const isDownloadsPage = window.location.pathname.startsWith('/downloads');
  // Check if it's an API request (either absolute URL or relative to baseURL)
  const isApiRequest = (config.url?.startsWith('http') || (config.baseURL && config.baseURL.startsWith('http')));

  if ((isDownloadsPage || isOffline) && isApiRequest) {
      // If user is offline OR on downloads page without a valid session (implied by usage context), 
      // block external API calls to prevent noise.
      // But allow if we are online and just happen to be on downloads page (e.g. for cover repair)
      // Actually, if we are purely offline mode (no token), we should block.
      if (!token || isOffline) {
          const controller = new AbortController();
          config.signal = controller.signal;
          controller.abort('Offline Mode');
      }
  }
  
  // Update baseURL dynamically from store
  if (activeUrl && !config.url?.startsWith('http')) {
    config.baseURL = activeUrl;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    // Check if we were redirected and update activeUrl if needed
    // Note: This relies on the browser/XHR exposing the final URL
    if (response.request && response.request.responseURL) {
      // ... (existing logic if needed)
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Handle Network Error or Connection Refused (potentially redirect expired)
    // Only in Electron environment where we manage serverUrl/activeUrl
    if (!error.response && !originalRequest._retry && (window as any).electronAPI) {
      // Check for offline mode FIRST
      if (!navigator.onLine) {
          return Promise.reject(error);
      }
      
      const { serverUrl, activeUrl, setActiveUrl } = useAuthStore.getState();

      // If we have a serverUrl and it's different or we want to re-verify
      if (serverUrl) {
        console.log('Network error, attempting to re-resolve server URL from:', serverUrl);
        originalRequest._retry = true;
        
        try {
           // Call Electron IPC to resolve again
           const newUrl = await (window as any).electronAPI.resolveRedirect(serverUrl);
           
           // In main.js, resolve-redirect returns the URL string directly
           if (newUrl && typeof newUrl === 'string') {
             console.log('Resolved new active URL:', newUrl);
             
             // Update store
             setActiveUrl(newUrl);
             
             // Update request baseURL and retry
             originalRequest.baseURL = newUrl;
             
             return apiClient(originalRequest);
           }
        } catch (resolveErr) {
          console.error('Failed to re-resolve server URL', resolveErr);
        }
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
