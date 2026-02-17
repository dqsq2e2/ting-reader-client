export const isApp = false;
export const isElectron = !!(window as Window & { electronAPI?: unknown }).electronAPI;
