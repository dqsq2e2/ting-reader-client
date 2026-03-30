import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book, Chapter } from '../types';
import { isTooLight } from '../utils/color';

type ChapterProgressMeta = {
  progressUpdatedAt?: string;
  progressPosition?: number;
};

const getProgressUpdatedAt = (chapter: Chapter) => (chapter as Chapter & ChapterProgressMeta).progressUpdatedAt;
const getProgressPosition = (chapter: Chapter) => {
  const value = (chapter as Chapter & ChapterProgressMeta).progressPosition;
  return typeof value === 'number' ? value : 0;
};

interface PlayerState {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  chapters: Chapter[];
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackSpeed: number;
  volume: number;
  themeColor: string;
  clientAutoDownload: boolean;
  isExpanded: boolean;
  isCollapsed: boolean;
  isSeriesEditing: boolean;
  chapterProgress: Record<string, number>;
  
  // Actions
  playBook: (book: Book, chapters: Chapter[], startChapterId?: string) => void;
  togglePlay: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setThemeColor: (color: string) => void;
  setClientAutoDownload: (enabled: boolean) => void;
  nextChapter: () => void;
  prevChapter: () => void;
  playChapter: (book: Book, chapters: Chapter[], chapter: Chapter, resumePosition?: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsExpanded: (isExpanded: boolean) => void;
  setIsCollapsed: (isCollapsed: boolean) => void;
  setIsSeriesEditing: (isSeriesEditing: boolean) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentBook: null,
      currentChapter: null,
      chapters: [],
      isPlaying: false,
      duration: 0,
      currentTime: 0,
      playbackSpeed: 1.0,
      volume: 1.0,
      themeColor: '#F2EDE4',
      clientAutoDownload: false,
      isExpanded: false,
      isCollapsed: false,
      isSeriesEditing: false,
      chapterProgress: {},

      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setIsExpanded: (isExpanded) => set({ isExpanded }),
      setIsCollapsed: (isCollapsed) => set({ isCollapsed }),
      setIsSeriesEditing: (isSeriesEditing) => set({ isSeriesEditing }),
      setClientAutoDownload: (enabled) => set({ clientAutoDownload: enabled }),

      playBook: (book, chapters, startChapterId) => {
        const isOffline = typeof window !== 'undefined' && (!navigator.onLine || window.location.hash.includes('/offline'));
        let chapter;
        if (startChapterId) {
          chapter = chapters.find(c => c.id === startChapterId) || chapters[0];
        } else {
          const playedChapters = [...chapters].filter(c => !!getProgressUpdatedAt(c));
          if (playedChapters.length > 0) {
            playedChapters.sort((a, b) => {
              const dateA = new Date(getProgressUpdatedAt(a) || 0).getTime();
              const dateB = new Date(getProgressUpdatedAt(b) || 0).getTime();
              return dateB - dateA;
            });
            chapter = playedChapters[0];
          } else {
            chapter = chapters[0];
          }
        }

        const { chapterProgress } = get();
        const resume = isOffline ? (chapterProgress[chapter.id] ?? getProgressPosition(chapter)) : getProgressPosition(chapter);

        const newState: Partial<PlayerState> = { 
          currentBook: book, 
          chapters, 
          currentChapter: chapter, 
          isPlaying: true, 
          currentTime: resume
        };

        if (book.themeColor && !isTooLight(book.themeColor)) {
          newState.themeColor = book.themeColor;
        } else {
          newState.themeColor = '#F2EDE4';
        }

        set(newState);
      },

      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
      
      setCurrentTime: (time) => set((state) => {
        const isOffline = typeof window !== 'undefined' && (!navigator.onLine || window.location.hash.includes('/offline'));
        if (!isOffline || !state.currentChapter) return { currentTime: time };
        return { 
          currentTime: time,
          chapterProgress: { ...state.chapterProgress, [state.currentChapter.id]: time }
        };
      }),
      
      setDuration: (duration) => set({ duration }),
      
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      
      setVolume: (volume) => set({ volume }),

      setThemeColor: (color) => set({ themeColor: color }),

      nextChapter: () => {
        const { currentChapter, chapters, chapterProgress, currentBook } = get();
        if (!currentChapter || !currentBook) return;

        // 确保 chapters 数组不为空且包含当前章节
        if (chapters.length === 0 || !chapters.some(c => c.id === currentChapter.id)) {
          console.warn('Chapters array is empty or does not contain current chapter, cannot proceed to next chapter');
          return;
        }

        const index = chapters.findIndex(c => c.id === currentChapter.id);
        if (index !== -1 && index < chapters.length - 1) {
          const next = chapters[index + 1];
          const isOffline = typeof window !== 'undefined' && (!navigator.onLine || window.location.hash.includes('/offline'));
          const resume = isOffline ? (chapterProgress[next.id] ?? getProgressPosition(next)) : getProgressPosition(next);
          get().playChapter(currentBook, chapters, next, resume);
        }
      },

      prevChapter: () => {
        const { currentChapter, chapters, chapterProgress, currentBook } = get();
        if (!currentChapter || !currentBook) return;
        const index = chapters.findIndex(c => c.id === currentChapter.id);
        if (index > 0) {
          const prev = chapters[index - 1];
          const isOffline = typeof window !== 'undefined' && (!navigator.onLine || window.location.hash.includes('/offline'));
          const resume = isOffline ? (chapterProgress[prev.id] ?? getProgressPosition(prev)) : getProgressPosition(prev);
          get().playChapter(currentBook, chapters, prev, resume);
        }
      },

      playChapter: (book, chapters, chapter, resumePosition) => {
        const isOffline = typeof window !== 'undefined' && (!navigator.onLine || window.location.hash.includes('/offline'));
        const { chapterProgress } = get();
        const resume = resumePosition ?? (isOffline ? (chapterProgress[chapter.id] ?? getProgressPosition(chapter)) : getProgressPosition(chapter));
        const newState: Partial<PlayerState> = {
          currentBook: book,
          chapters,
          currentChapter: chapter,
          isPlaying: true,
          currentTime: resume
        };
        
        if (book.themeColor && !isTooLight(book.themeColor)) {
          newState.themeColor = book.themeColor;
        } else {
          newState.themeColor = '#F2EDE4';
        }

        set(newState);
      }
    }),
    {
      name: 'offline-progress-storage',
      partialize: (state) => ({ chapterProgress: state.chapterProgress })
    }
  )
);