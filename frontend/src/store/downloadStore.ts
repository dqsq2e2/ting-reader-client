import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// mobileDownload is only for mobile app
// import { downloadToCache as mobileDownload } from '../utils/mobileCacheManager';
import { useAuthStore } from './authStore';

type DownloadResult = {
  success: boolean;
  error?: string;
};

type ElectronApi = {
  downloadCover: (url: string, bookId: string, force?: boolean) => Promise<unknown>;
  downloadChapter: (url: string, fileName: string, taskId: string) => Promise<DownloadResult>;
};

const getElectronApi = () => (window as Window & { electronAPI?: ElectronApi }).electronAPI;

export interface DownloadTask {
  id: string; // chapterId
  bookId: string;
  bookTitle?: string;
  coverUrl?: string;
  themeColor?: string;
  chapterId: string;
  title: string;
  chapterNum?: number;
  duration?: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  error?: string;
  timestamp: number;
}

interface DownloadState {
  tasks: DownloadTask[];
  activeTaskId: string | null;
  
  addTask: (task: Omit<DownloadTask, 'status' | 'progress' | 'timestamp' | 'error'>) => void;
  startDownload: (taskId: string) => Promise<void>;
  processQueue: () => void;
  updateTaskProgress: (taskId: string, progress: number) => void;
  completeTask: (taskId: string) => void;
  failTask: (taskId: string, error: string) => void;
  clearCompleted: () => void;
  removeTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;
  clearAllTasks: () => void;
  redownloadCover: (taskId: string) => Promise<void>;
  initializeQueue: () => void;
}

const isElectron = typeof window !== 'undefined' && !!getElectronApi();

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      tasks: [],
      activeTaskId: null,

      initializeQueue: () => {
        set(state => ({
          tasks: state.tasks.map(t => 
            t.status === 'downloading' ? { ...t, status: 'pending' } : t
          ),
          activeTaskId: null
        }));
        get().processQueue();
      },

      clearAllTasks: () => {
        set({ tasks: [], activeTaskId: null });
      },

      redownloadCover: async (taskId) => {
        const { tasks } = get();
        const task = tasks.find(t => t.id === taskId);
        const electronAPI = getElectronApi();
        if (!task || !task.coverUrl || !electronAPI) return;

        try {
            const authStore = useAuthStore.getState();
            const baseUrl = authStore.activeUrl || authStore.serverUrl;
            const cleanBaseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : '';
            const token = authStore.token;
            
            let coverDownloadUrl = task.coverUrl;
            
            // Check if URL is absolute (http/https/protocol-relative)
            const isAbsolute = /^https?:\/\//i.test(coverDownloadUrl) || coverDownloadUrl.startsWith('//');
            
            if (!isAbsolute) {
                // Relative Internal Path: Prepend base URL
                coverDownloadUrl = `${cleanBaseUrl}${coverDownloadUrl.startsWith('/') ? '' : '/'}${coverDownloadUrl}`;
            }
            
            // Add token if it's an Internal URL (either originally relative, or absolute matching our server)
            // AND if it doesn't already have a token
            if ((!isAbsolute || (cleanBaseUrl && coverDownloadUrl.startsWith(cleanBaseUrl))) && token && !coverDownloadUrl.includes('token=')) {
                 coverDownloadUrl += `${coverDownloadUrl.includes('?') ? '&' : '?'}token=${token}`;
            }
            // For External URLs (Ximalaya etc.), we leave them alone (no token)
            
            console.log('Redownloading cover for task:', taskId, coverDownloadUrl);
            await electronAPI.downloadCover(coverDownloadUrl, task.bookId, true);
        } catch (err) {
            console.error('Redownload cover failed', err);
        }
      },

      addTask: (taskInfo) => {
        const { tasks } = get();
        if (tasks.find(t => t.id === taskInfo.id && t.status !== 'failed')) return;

        // If it failed before, reset it
        const existingFailed = tasks.find(t => t.id === taskInfo.id && t.status === 'failed');
        if (existingFailed) {
            get().retryTask(taskInfo.id);
            return;
        }

        const newTask: DownloadTask = {
          ...taskInfo,
          status: 'pending',
          progress: 0,
          timestamp: Date.now()
        };

        set({ tasks: [newTask, ...tasks] });
        get().processQueue();
      },

      processQueue: async () => {
        const { tasks, activeTaskId, startDownload } = get();
        if (activeTaskId) return;

        const nextTask = tasks.find(t => t.status === 'pending');
        if (nextTask) {
          startDownload(nextTask.id);
        }
      },

      startDownload: async (taskId) => {
        set({ activeTaskId: taskId });
        const { tasks, completeTask, failTask } = get();
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
             set({ activeTaskId: null });
             return;
        }

        set(state => ({
          tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'downloading', error: undefined } : t)
        }));

        try {
          const authStore = useAuthStore.getState();
          const baseUrl = authStore.activeUrl || authStore.serverUrl;
          const token = authStore.token;
          
          const downloadUrl = `${baseUrl}/api/stream/${task.chapterId}?token=${token}`;
          const fileName = `${task.chapterId}.mp3`;

          if (isElectron) {
             const electronAPI = getElectronApi();
             if (!electronAPI) {
               throw new Error('当前环境（Web）暂不支持下载功能');
             }
             // 1. Trigger cover download (fire and forget, backend checks existence)
             if (task.coverUrl && task.bookId) {
                 // Force download cover when starting a download task to ensure it exists
                 let coverDownloadUrl = task.coverUrl;
                 const cleanBaseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : '';
                 
                 const isAbsolute = /^https?:\/\//i.test(coverDownloadUrl) || coverDownloadUrl.startsWith('//');
                 
                 if (!isAbsolute) {
                     coverDownloadUrl = `${cleanBaseUrl}${coverDownloadUrl.startsWith('/') ? '' : '/'}${coverDownloadUrl}`;
                 }
                 
                 // Add token for access to internal images
                 if ((!isAbsolute || (cleanBaseUrl && coverDownloadUrl.startsWith(cleanBaseUrl))) && token && !coverDownloadUrl.includes('token=')) {
                     coverDownloadUrl += `${coverDownloadUrl.includes('?') ? '&' : '?'}token=${token}`;
                 }
                 
                 electronAPI.downloadCover(coverDownloadUrl, task.bookId, true).catch((error) => console.error('Cover download trigger failed', error));
             }

             const result = await electronAPI.downloadChapter(downloadUrl, fileName, taskId);
             if (!result?.success) throw new Error(result?.error || 'Download failed');
          } else {
             // Mobile download not supported in this client project
             throw new Error('当前环境（Web）暂不支持下载功能');
          }
          
          completeTask(taskId);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Download failed';
          failTask(taskId, message);
        } finally {
          set({ activeTaskId: null });
          get().processQueue();
        }
      },

      updateTaskProgress: (taskId, progress) => {
        set(state => ({
          tasks: state.tasks.map(t => t.id === taskId ? { ...t, progress } : t)
        }));
      },

      completeTask: (taskId) => {
        set(state => ({
          tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'completed', progress: 100 } : t)
        }));
      },

      failTask: (taskId, error) => {
        set(state => ({
          tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'failed', error } : t)
        }));
      },
      
      clearCompleted: () => {
          set(state => ({
              tasks: state.tasks.filter(t => t.status !== 'completed')
          }));
      },

      removeTask: (taskId) => {
          set(state => ({
              tasks: state.tasks.filter(t => t.id !== taskId)
          }));
      },
      
      retryTask: (taskId) => {
          set(state => ({
              tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'pending', progress: 0, error: undefined } : t)
          }));
          get().processQueue();
      }
    }),
    {
      name: 'download-storage',
      partialize: (state) => ({ tasks: state.tasks }),
    }
  )
);
