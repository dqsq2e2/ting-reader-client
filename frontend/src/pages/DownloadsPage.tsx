import React, { useState, useEffect } from 'react';
import { useDownloadStore } from '../store/downloadStore';
import { useAuthStore } from '../store/authStore';
import { Trash2, CheckCircle2, Loader2, AlertCircle, Download, ChevronDown, ChevronRight, HardDrive, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { getCoverUrl } from '../utils/image';

import { usePlayerStore } from '../store/playerStore';
import { Play } from 'lucide-react';

const DownloadsPage: React.FC<{ isOfflineMode?: boolean }> = ({ isOfflineMode = false }) => {
  const navigate = useNavigate();
  const { tasks, removeTask } = useDownloadStore();
  const { isAuthenticated } = useAuthStore();
  const { playChapter } = usePlayerStore();
  const [activeTab, setActiveTab] = useState<'all' | 'downloading' | 'completed'>('all');
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const isElectron = !!(window as any).electronAPI;
  
  const [fetchedBooks, setFetchedBooks] = useState<Record<string, { title: string, cover_url: string, library_id: string, theme_color?: string }>>({});
  

  const filteredTasks = tasks.filter(task => {
    if (activeTab === 'all') return true;
    if (activeTab === 'downloading') return task.status === 'pending' || task.status === 'downloading';
    if (activeTab === 'completed') return task.status === 'completed';
    return true;
  });

  // Group tasks by book
  const bookGroups = React.useMemo(() => {
    const groups: Record<string, { bookTitle: string, coverUrl?: string, tasks: typeof filteredTasks }> = {};
    
    filteredTasks.forEach(task => {
      const bookId = task.bookId || 'unknown';
      if (!groups[bookId]) {
        groups[bookId] = {
          bookTitle: task.bookTitle || (bookId === 'unknown' ? '未知书籍' : `书籍 ${bookId.substring(0, 8)}...`),
          coverUrl: task.coverUrl,
          tasks: []
        };
      }
      groups[bookId].tasks.push(task);
    });

    // Sort tasks by chapterNum
    Object.values(groups).forEach(group => {
      group.tasks.sort((a, b) => {
        if (a.chapterNum && b.chapterNum) {
          return a.chapterNum - b.chapterNum;
        }
        return (a.title || '').localeCompare(b.title || '');
      });
    });

    return Object.entries(groups).map(([bookId, data]) => ({
      bookId,
      bookTitle: data.bookTitle,
      coverUrl: data.coverUrl,
      tasks: data.tasks
    }));
  }, [filteredTasks]);

  // Fetch missing book details
  useEffect(() => {
    // Skip fetching if explicit offline mode or no network
    if (isOfflineMode || !navigator.onLine) return;

    const fetchMissingDetails = async () => {
      const bookIdsToFetch = bookGroups
        .map(g => g.bookId)
        .filter(bookId => bookId !== 'unknown')
        .filter(bookId => {
           // Skip if already fetched
           if (fetchedBooks[bookId]) return false;
           
           // Fetch if title looks like a raw ID or "Unknown" OR if cover is missing
           // Note: The task might have a valid title but missing cover
           const isTitleGeneric = !groupTitleIsValid(bookGroups.find(g => g.bookId === bookId)?.bookTitle);
           const isCoverMissing = !bookGroups.find(g => g.bookId === bookId)?.coverUrl;
           
           return isTitleGeneric || isCoverMissing;
        });
        
      if (bookIdsToFetch.length === 0) return;

      // Simple dedup to avoid multiple requests
      const uniqueIds = [...new Set(bookIdsToFetch)];

      uniqueIds.forEach(async (id) => {
          try {
              const res = await apiClient.get(`/api/books/${id}`);
              if (res.data) {
                  setFetchedBooks(prev => ({
                      ...prev,
                      [id]: {
                          title: res.data.title,
                          cover_url: res.data.cover_url,
                          library_id: res.data.library_id,
                          theme_color: res.data.theme_color
                      }
                  }));
              }
          } catch (e) {
              console.error(`Failed to fetch info for book ${id}`, e);
          }
      });
    };
    
    fetchMissingDetails();
  }, [bookGroups.length]); // Depend on list length to trigger check when new groups appear

  const groupTitleIsValid = (title?: string) => {
      if (!title) return false;
      if (title.startsWith('未知书籍')) return false;
      if (title.startsWith('Book ')) return false; // Likely a UUID fallback
      return true;
  };

  const toggleExpand = (bookId: string) => {
    if (expandedBookId === bookId) {
      setExpandedBookId(null);
    } else {
      setExpandedBookId(bookId);
    }
  };

  const handleDelete = async (taskId: string, chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除此下载记录吗？已下载的文件也将被删除。')) {
        removeTask(taskId);
        try {
            if (isElectron) {
                await (window as any).electronAPI.removeCachedFile(`${chapterId}.mp3`);
            }
        } catch (err) {
            console.error('Failed to remove file:', err);
        }
        // Remove from selection if it was selected
        if (selectedTasks.has(taskId)) {
            const newSelected = new Set(selectedTasks);
            newSelected.delete(taskId);
            setSelectedTasks(newSelected);
        }
    }
  };

  const handleDeleteBook = async (bookId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tasksToDelete = filteredTasks.filter(t => t.bookId === bookId);
    if (confirm(`确定要删除该书籍的所有缓存吗？(${tasksToDelete.length} 章)`)) {
        for (const task of tasksToDelete) {
            removeTask(task.id);
            try {
                if (isElectron) {
                    await (window as any).electronAPI.removeCachedFile(`${task.chapterId}.mp3`);
                }
            } catch (err) {
                console.error('Failed to remove file:', err);
            }
        }
        // Remove deleted tasks from selection
        const newSelected = new Set(selectedTasks);
        let changed = false;
        tasksToDelete.forEach(t => {
            if (newSelected.has(t.id)) {
                newSelected.delete(t.id);
                changed = true;
            }
        });
        if (changed) {
            setSelectedTasks(newSelected);
        }
    }
  };
  
  const clearHistory = () => {
      if (confirm('确定要清除所有已失败的下载记录吗？(不会删除已完成和进行中的任务)')) {
          const failedTasks = tasks.filter(t => t.status === 'failed');
          failedTasks.forEach(t => removeTask(t.id));
      }
  };

  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

  const toggleSelect = (taskId: string) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const toggleSelectBook = (bookId: string, taskIds: string[]) => {
    const newSelected = new Set(selectedTasks);
    const allSelected = taskIds.every(id => newSelected.has(id));
    
    if (allSelected) {
      taskIds.forEach(id => newSelected.delete(id));
    } else {
      taskIds.forEach(id => newSelected.add(id));
    }
    setSelectedTasks(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedTasks.size === 0) return;
    if (confirm(`确定要删除选中的 ${selectedTasks.size} 个下载记录吗？`)) {
      for (const taskId of selectedTasks) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          removeTask(taskId);
          try {
            if (isElectron) {
               await (window as any).electronAPI.removeCachedFile(`${task.chapterId}.mp3`);
            }
          } catch (err) {
             console.error('Failed to remove file:', err);
          }
        }
      }
      setSelectedTasks(new Set());
    }
  };

  const handlePlay = (task: typeof filteredTasks[0]) => {
      // Construct a minimal book object and chapter list to play
      const fetchedInfo = fetchedBooks[task.bookId];
      const book = {
          id: task.bookId || 'unknown',
          title: fetchedInfo?.title || task.bookTitle || '未知书籍',
          cover_url: fetchedInfo?.cover_url || task.coverUrl || '',
          library_id: fetchedInfo?.library_id || 'default', // Fallback
          theme_color: fetchedInfo?.theme_color || task.themeColor
      };
      
      // Filter all downloaded chapters for this book to create a playlist
      const bookTasks = tasks
        .filter(t => t.bookId === task.bookId && t.status === 'completed')
        .sort((a, b) => {
            // Try to sort by chapter index if available in title or some other way?
            // Currently tasks don't store index. We can sort by title or timestamp.
            // Let's sort by title for now as a best guess for order.
            return (a.title || '').localeCompare(b.title || '');
        });

      const chapters = bookTasks.map(t => ({
          id: t.chapterId,
          title: t.title,
          book_id: t.bookId,
          chapter_index: 0, // Unknown
          duration: 0
      }));

      const currentChapter = {
          id: task.chapterId,
          title: task.title,
          book_id: task.bookId,
          chapter_index: 0,
          duration: 0
      };

      playChapter(book as any, chapters, currentChapter);
  };

  return (
    <div className="flex-1 min-h-full flex flex-col p-4 sm:p-6 md:p-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
            <h1 className="text-2xl md:text-3xl font-bold dark:text-white flex items-center gap-3">
                <Download size={28} className="text-primary-600 md:w-8 md:h-8" />
                缓存管理
            </h1>
            <p className="text-sm md:text-base text-slate-500 mt-1">
                管理本地已下载的音频文件，支持离线播放。
            </p>
        </div>
        <div className="flex gap-2">
            {selectedTasks.size > 0 && (
                <button 
                    onClick={handleBatchDelete} 
                    className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 px-4 py-2 rounded-xl transition-colors font-medium text-sm"
                >
                    <Trash2 size={18} />
                    删除选中 ({selectedTasks.size})
                </button>
            )}
            {tasks.some(t => t.status === 'failed') && (
                <button 
                    onClick={clearHistory} 
                    className="flex items-center gap-2 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 px-4 py-2 rounded-xl transition-colors font-medium text-sm"
                >
                    <Trash2 size={18} />
                    清除失败记录
                </button>
            )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {[
            { id: 'all', label: '全部' },
            { id: 'downloading', label: '进行中' },
            { id: 'completed', label: '已完成' }
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                    activeTab === tab.id
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                        : 'bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }`}
            >
                {tab.label} ({
                    tab.id === 'all' ? tasks.length :
                    tab.id === 'downloading' ? tasks.filter(t => t.status === 'pending' || t.status === 'downloading').length :
                    tasks.filter(t => t.status === 'completed').length
                })
            </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {bookGroups.length === 0 ? (
            <div className="text-center py-20 px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 mb-4">
                    <Download size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">暂无下载记录</h3>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">您下载的书籍将显示在这里。</p>
            </div>
        ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {bookGroups.map(group => {
                    const groupTaskIds = group.tasks.map(t => t.id);
                    const isAllSelected = groupTaskIds.length > 0 && groupTaskIds.every(id => selectedTasks.has(id));
                    const isSomeSelected = groupTaskIds.some(id => selectedTasks.has(id));
                    
                    // Use fetched info if available, otherwise fallback to group info
                    const fetchedInfo = fetchedBooks[group.bookId];
                    const displayTitle = fetchedInfo?.title || group.bookTitle;
                    // For cover, if we have fetched info, we construct the URL. Otherwise use existing.
                    const displayCoverUrl = fetchedInfo 
                        ? getCoverUrl(fetchedInfo.cover_url, fetchedInfo.library_id, group.bookId) 
                        : getCoverUrl(group.coverUrl, 'default', group.bookId);

                    return (
                    <div key={group.bookId} className="bg-white dark:bg-slate-900 transition-colors">
                        {/* Book Header */}
                        <div 
                            className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer group"
                            onClick={() => toggleExpand(group.bookId)}
                        >
                            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                    type="checkbox"
                                    checked={isAllSelected}
                                    ref={input => { if (input) input.indeterminate = isSomeSelected && !isAllSelected; }}
                                    onChange={() => toggleSelectBook(group.bookId, groupTaskIds)}
                                    className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 mr-4"
                                />
                            </div>

                            <div className="w-8 h-8 flex items-center justify-center text-slate-400">
                                {expandedBookId === group.bookId ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            </div>
                            
                            <div className="w-10 h-14 bg-slate-200 dark:bg-slate-700 rounded-md shrink-0 flex items-center justify-center overflow-hidden">
                                {displayCoverUrl ? (
                                    <img src={displayCoverUrl} alt={displayTitle} className="w-full h-full object-cover" />
                                ) : (
                                    <Download size={20} className="text-slate-400" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-slate-900 dark:text-white truncate">{displayTitle}</h3>
                                <p className="text-sm text-slate-500 mt-0.5">{group.tasks.length} 个章节</p>
                            </div>

                            <button
                                onClick={(e) => handleDeleteBook(group.bookId, e)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="删除整书缓存"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        {/* Chapters List (Accordion Content) */}
                        {expandedBookId === group.bookId && (
                            <div className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 pl-4 sm:pl-12">
                                {group.tasks.map(task => (
                                    <div key={task.id} className="p-3 pl-4 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-4 group/item">
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox"
                                                checked={selectedTasks.has(task.id)}
                                                onChange={() => toggleSelect(task.id)}
                                                className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                            />
                                        </div>

                                        {/* Icon Status */}
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                            task.status === 'completed' ? 'bg-green-50 text-green-500 dark:bg-green-900/20' :
                                            task.status === 'failed' ? 'bg-red-50 text-red-500 dark:bg-red-900/20' :
                                            'bg-primary-50 text-primary-500 dark:bg-primary-900/20'
                                        }`}>
                                            {task.status === 'completed' ? <CheckCircle2 size={16} /> :
                                             task.status === 'failed' ? <AlertCircle size={16} /> :
                                             <Loader2 size={16} className="animate-spin" />}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-medium text-slate-900 dark:text-white truncate text-sm">
                                                    {task.chapterNum ? `第${task.chapterNum}章 ` : ''}{task.title || `章节 ${task.chapterId}`}
                                                </h4>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                                    task.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                    task.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                }`}>
                                                    {task.status === 'pending' ? '等待' :
                                                     task.status === 'downloading' ? '下载中' :
                                                     task.status === 'completed' ? '完成' : '失败'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5">
                                                {task.progress > 0 && task.status === 'downloading' && (
                                                    <span>{Math.round(task.progress * 100)}%</span>
                                                )}
                                                {task.error && (
                                                    <span className="text-red-500 truncate max-w-[200px]">{task.error}</span>
                                                )}
                                                <span>{new Date(task.timestamp).toLocaleString()}</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1">
                                            {task.status === 'completed' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handlePlay(task); }}
                                                    className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all"
                                                    title="播放"
                                                >
                                                    <Play size={16} fill="currentColor" />
                                                </button>
                                            )}
                                            <button 
                                                onClick={(e) => handleDelete(task.id, task.chapterId, e)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                                                title="删除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
                })}
            </div>
        )}
      </div>
    </div>
  );
};

export default DownloadsPage;