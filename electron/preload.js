const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  resolveRedirect: (url) => ipcRenderer.invoke('resolve-redirect', url),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getCacheSize: () => ipcRenderer.invoke('get-cache-size'),
  downloadChapter: (url, fileName, taskId) => ipcRenderer.invoke('download-chapter', { url, fileName, taskId }),
  downloadCover: (url, bookId, force) => ipcRenderer.invoke('download-cover', { url, bookId, force }),
  checkCached: (fileNames) => ipcRenderer.invoke('check-cached', fileNames),
  removeCachedFile: (fileName) => ipcRenderer.invoke('remove-cached-file', fileName),
  onDownloadProgress: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('download-progress', subscription);
      return () => ipcRenderer.removeListener('download-progress', subscription);
  },
  removeDownloadProgressListeners: () => ipcRenderer.removeAllListeners('download-progress'),
  isElectron: true,
  listCachedFiles: () => ipcRenderer.invoke('list-cached-files')
});
