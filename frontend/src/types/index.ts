export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
  librariesAccessible?: string[];
  booksAccessible?: string[];
}

export interface ScraperConfig {
  defaultSources?: string[];
  coverSources?: string[];
  introSources?: string[];
  authorSources?: string[];
  narratorSources?: string[];
  tagsSources?: string[];
  nfoWritingEnabled?: boolean;
}

export interface Library {
  id: string;
  name: string;
  libraryType: 'webdav' | 'local';
  url: string;
  username?: string;
  password?: string;
  rootPath: string;
  lastScannedAt?: string;
  scraperConfig?: ScraperConfig;
  createdAt: string;
}

export interface Book {
  id: string;
  libraryId: string;
  title: string;
  author?: string;
  narrator?: string;
  description?: string;
  coverUrl?: string;
  themeColor?: string;
  path: string;
  hash: string;
  createdAt: string;
  updatedAt?: string;
  isFavorite?: boolean;
  libraryType?: 'webdav' | 'local';
  skipIntro?: number;
  skipOutro?: number;
  tags?: string;
  chapterRegex?: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  path: string;
  duration: number;
  chapterIndex: number;
  isExtra?: number;
  progressPosition?: number;
  progressUpdatedAt?: string;
}

export interface Progress {
  bookId: string;
  chapterId: string;
  position: number;
  updatedAt: string;
  bookTitle?: string;
  chapterTitle?: string;
  coverUrl?: string;
  libraryId?: string;
  chapterDuration?: number;
}

export interface Stats {
  totalBooks: number;
  totalChapters: number;
  totalDuration: number;
  lastScanTime?: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  pluginType: 'scraper' | 'format' | 'utility';
  author: string;
  description: string;
  state: 'active' | 'inactive' | 'loading' | 'failed';
  totalCalls?: number;
  successfulCalls?: number;
  failedCalls?: number;
  successRate?: number;
}

export interface MergeSuggestion {
  id: string;
  sourceBookId: string;
  sourceBookTitle: string;
  targetBookId: string;
  targetBookTitle: string;
  score: number;
  reason: string;
  status: 'pending' | 'merged' | 'ignored';
  createdAt: string;
}

export interface BookMetadata {
  title: string;
  author: string;
  narrator: string;
  description: string;
  coverUrl: string;
  tags?: string[];
}

export interface ChapterChange {
  index: number;
  currentTitle: string | null;
  scrapedTitle: string | null;
  status: 'match' | 'update' | 'missing' | 'new';
}

export interface ScrapeDiff {
  current: BookMetadata;
  scraped: BookMetadata;
  chapterChanges: ChapterChange[];
}
