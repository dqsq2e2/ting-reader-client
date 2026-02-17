type WindowWithElectron = Window & { electronAPI?: unknown };

export const getCoverUrl = (url?: string, libraryId?: string, bookId?: string) => {
  // Try to get dynamic base URL from storage first (for Electron), then env, then default
  const storageUrl = localStorage.getItem('active_url') || localStorage.getItem('server_url');
  const API_BASE_URL = storageUrl || import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:3000');
  const token = localStorage.getItem('auth_token');
  
  if (!url) return '/placeholder-cover.png';
  
  // For HTTP/HTTPS URLs:
  if (url.startsWith('http')) {
      // Electron: Use ting:// to support offline caching for remote images too
      if ((window as WindowWithElectron).electronAPI && bookId) {
         return `ting://cover/${bookId}?remote=${encodeURIComponent(url)}`;
      }
      return url;
  }
  
  if (!libraryId) return url;
  
  let coverUrl = `${API_BASE_URL}/api/proxy/cover?path=${encodeURIComponent(url)}&libraryId=${libraryId}`;
  
  if (url === 'embedded://first-chapter' && bookId) {
    coverUrl += `&bookId=${bookId}`;
  }
  
  if (token) {
    coverUrl += `&token=${token}`;
  }

  // Electron Environment: Use ting:// protocol to support offline caching
  if ((window as WindowWithElectron).electronAPI && bookId) {
      // If we are in Electron, we want to try the local cache first.
      // We use 'ting://cover/<bookId>?remote=<encoded_url>'
      // The backend will check local 'cover_<bookId>' file.
      // If not found, it will fetch from 'remote' and cache it.
      
      // Note: 'coverUrl' constructed above is the HTTP URL (possibly proxied).
      // We pass THIS url as the 'remote' parameter to the ting protocol.
      return `ting://cover/${bookId}?remote=${encodeURIComponent(coverUrl)}`;
  }

  return coverUrl;
};
