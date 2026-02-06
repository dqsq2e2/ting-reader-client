const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  resolveRedirect: (url) => ipcRenderer.invoke('resolve-redirect', url),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getCacheSize: () => ipcRenderer.invoke('get-cache-size'),
  isElectron: true
});
