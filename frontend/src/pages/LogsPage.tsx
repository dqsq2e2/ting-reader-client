import React, { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import { 
  Terminal, 
  RefreshCw, 
  Download,
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2,
  Database,
  Trash2,
  StopCircle,
  CheckSquare,
  FileSignature,
  Activity,
  LogOut,
  PlayCircle,
  MoreHorizontal,
  Eraser
} from 'lucide-react';
import { formatDate } from '../utils/date';
import { getTaskStatusText } from '../utils/task';

interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  task_id?: string;
  task_status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  task_type?: string;
}

const MODULE_OPTIONS = [
  { label: '全部核心日志', value: 'audit' },
  { label: '登录记录', value: 'audit::login' },
  { label: '播放记录', value: 'audit::playback' },
  { label: '扫描记录', value: 'audit::scan' },
  { label: '元数据记录', value: 'audit::metadata' },
  { label: '存储库记录', value: 'audit::library' },
  { label: '系统所有日志', value: 'all' }
];

const LEVEL_OPTIONS = [
  { label: '全部', value: '' },
  { label: 'INFO', value: 'INFO' },
  { label: 'WARN', value: 'WARN' },
  { label: 'ERROR', value: 'ERROR' }
];

const LogsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  const [moduleFilter, setModuleFilter] = useState('audit');
  const [levelFilter, setLevelFilter] = useState('');
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const page = 1;
  const pageSize = 100;

  const fetchData = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/v1/system/logs', {
        params: {
          level: levelFilter,
          module: moduleFilter,
          page,
          page_size: pageSize
        }
      });
      
      const newLogs: LogEntry[] = response.data.logs || [];
      setLogs(newLogs);

      // Clean up selected task IDs that no longer exist
      setSelectedTaskIds(prev => {
        const newSet = new Set<string>();
        newLogs.forEach((log) => {
            if (log.task_id && prev.has(log.task_id)) newSet.add(log.task_id);
        });
        return newSet;
      });

    } catch (err) {
      console.error('获取日志数据失败', err);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, levelFilter, page]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [moduleFilter, levelFilter, fetchData]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (autoRefresh) {
      interval = setInterval(fetchData, 3000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const manualFetchData = async () => {
    setLoading(true);
    await fetchData();
  };

  // ---------------- Tasks Actions ----------------
  const handleCancelTask = async (taskId: string) => {
    try {
      await apiClient.post(`/api/tasks/${taskId}/cancel`);
      manualFetchData();
    } catch (err) {
      console.error('Failed to cancel task', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定要删除这条任务记录吗？')) return;
    try {
      await apiClient.delete(`/api/tasks/${taskId}`);
      manualFetchData();
    } catch (err) {
      console.error('Failed to delete task', err);
    }
  };

  const handleBatchDeleteTasks = async () => {
    if (selectedTaskIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedTaskIds.size} 条任务记录吗？`)) return;
    
    try {
        await apiClient.post('/api/tasks/batch-delete', { ids: Array.from(selectedTaskIds) });
        setSelectedTaskIds(new Set());
        setIsSelectionMode(false);
        manualFetchData();
    } catch (err) {
        console.error('Failed to batch delete tasks', err);
    }
  };

  const toggleSelectTask = (id: string) => {
    const newSet = new Set(selectedTaskIds);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setSelectedTaskIds(newSet);
    
    if (newSet.size === 0) {
        setIsSelectionMode(false);
    }
  };

  const deletableTasks = logs.filter(l => l.task_id && l.task_status !== 'running');

  const toggleSelectAllTasks = () => {
    if (selectedTaskIds.size === deletableTasks.length && deletableTasks.length > 0) {
        setSelectedTaskIds(new Set());
        setIsSelectionMode(false);
    } else {
        const newSet = new Set(deletableTasks.map(l => l.task_id as string));
        setSelectedTaskIds(newSet);
    }
  };

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
        setSelectedTaskIds(new Set());
        setIsSelectionMode(false);
    } else {
        setIsSelectionMode(true);
    }
  };

  // ---------------- Logs Actions ----------------
  const downloadFile = (data: string, filename: string) => {
    const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = async () => {
    try {
      const response = await apiClient.get('/api/v1/system/logs/export');
      downloadFile(response.data, 'system_logs.txt');
    } catch (err) {
      console.error('导出日志失败', err);
    }
  };

  const handleExportError = async () => {
    try {
      const response = await apiClient.get('/api/v1/system/logs/export', {
        params: { level: 'ERROR' }
      });
      downloadFile(response.data, 'error_logs.txt');
    } catch (err) {
      console.error('导出错误日志失败', err);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('确定要清空所有日志和任务记录吗？这将删除所有系统日志和已完成/失败的任务。')) return;
    try {
      // 同时清空任务记录和系统日志文件
      await Promise.all([
        apiClient.delete('/api/tasks'),
        apiClient.delete('/api/v1/system/logs')
      ]);
      manualFetchData();
    } catch (err) {
      console.error('清空日志失败', err);
    }
  };

  // ---------------- UI Helpers ----------------
  const getModuleName = (module: string) => {
    if (module.startsWith('audit::login')) return '登录记录';
    if (module.startsWith('audit::playback')) return '播放记录';
    if (module.startsWith('audit::scan')) return '扫描记录';
    if (module.startsWith('audit::metadata')) return '元数据记录';
    if (module.startsWith('audit::library')) return '存储库记录';
    if (module.startsWith('audit::task')) return '任务记录';
    if (module === 'audit') return '核心业务';
    if (module.startsWith('auth')) return '鉴权系统';
    if (module.startsWith('ting_reader::core::error')) return '核心错误';
    if (module.startsWith('ting_reader::api')) return 'API服务';
    return module;
  };

  const getLogIcon = (module: string) => {
    if (module.includes('login') || module.includes('auth')) return <LogOut size={20} className="sm:w-6 sm:h-6" />;
    if (module.includes('playback')) return <PlayCircle size={20} className="sm:w-6 sm:h-6" />;
    if (module.includes('scan')) return <Database size={20} className="sm:w-6 sm:h-6" />;
    if (module.includes('metadata')) return <FileSignature size={20} className="sm:w-6 sm:h-6" />;
    return <Activity size={20} className="sm:w-6 sm:h-6" />;
  };

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'text-red-500 bg-red-50 dark:bg-red-900/20';
      case 'WARN': return 'text-amber-500 bg-amber-50 dark:bg-amber-900/20';
      case 'INFO': return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'DEBUG': return 'text-purple-500 bg-purple-50 dark:bg-purple-900/20';
      default: return 'text-slate-500 bg-slate-50 dark:bg-slate-800';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="text-green-500" size={20} />;
      case 'failed': return <XCircle className="text-red-500" size={20} />;
      case 'running': return <Loader2 className="text-blue-500 animate-spin" size={20} />;
      case 'cancelled': return <XCircle className="text-gray-400" size={20} />;
      default: return <Clock className="text-slate-400" size={20} />;
    }
  };

  const isAllSelected = deletableTasks.length > 0 && selectedTaskIds.size === deletableTasks.length;
  const isIndeterminate = selectedTaskIds.size > 0 && selectedTaskIds.size < deletableTasks.length;
  const hasTasksInView = deletableTasks.length > 0;

  return (
    <div className="w-full max-w-screen-2xl mx-auto p-4 sm:p-6 md:p-8 lg:p-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-bold dark:text-white flex items-center justify-center md:justify-start gap-3">
            <Terminal size={28} className="text-primary-600 md:w-8 md:h-8" />
            系统日志
          </h1>
          <p className="text-sm md:text-base text-slate-500 mt-1">实时监控系统后台运行状态与任务进度</p>
        </div>
        
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 sm:gap-4">
          
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-sm text-slate-500 ml-2">模块</span>
            <select 
              value={moduleFilter} 
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setIsSelectionMode(false);
                setSelectedTaskIds(new Set());
              }}
              className="bg-transparent border-none text-sm focus:ring-0 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              {MODULE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-sm text-slate-500 ml-2">等级</span>
            <select 
              value={levelFilter} 
              onChange={(e) => setLevelFilter(e.target.value)}
              className="bg-transparent border-none text-sm focus:ring-0 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              {LEVEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-colors shadow-sm text-sm"
          >
            <Eraser size={16} />
            <span className="hidden xl:inline">清空</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-colors shadow-sm text-sm"
            >
              <MoreHorizontal size={16} />
              <span className="hidden xl:inline">更多</span>
            </button>

            {showMoreMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent transition-opacity"
                  onClick={() => setShowMoreMenu(false)}
                />
                <div className="absolute right-0 sm:left-auto sm:right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg z-[60] overflow-hidden max-[500px]:fixed max-[500px]:bottom-0 max-[500px]:left-0 max-[500px]:right-0 max-[500px]:w-full max-[500px]:rounded-t-2xl max-[500px]:rounded-b-none max-[500px]:pb-safe animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-top-2">
                  <button
                    onClick={() => {
                      handleExportAll();
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center justify-center sm:justify-start gap-3 px-4 py-4 sm:py-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <Download size={18} className="sm:w-4 sm:h-4" />
                    导出所有日志
                  </button>
                  <button
                    onClick={() => {
                      handleExportError();
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center justify-center sm:justify-start gap-3 px-4 py-4 sm:py-3 text-sm sm:text-base text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-slate-100 dark:border-slate-800"
                  >
                    <Download size={18} className="sm:w-4 sm:h-4" />
                    导出错误日志
                  </button>
                </div>
              </>
            )}
          </div>

          {isSelectionMode && selectedTaskIds.size > 0 && (
            <button
              onClick={handleBatchDeleteTasks}
              className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors text-sm font-medium border border-red-100"
            >
              <Trash2 size={16} />
              <span>删除 ({selectedTaskIds.size})</span>
            </button>
          )}

          {hasTasksInView && (
            <button
              onClick={toggleSelectionMode}
              className={`p-2 sm:p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-colors shadow-sm ${
                  isSelectionMode ? 'text-primary-600 bg-primary-50 border-primary-200' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50'
              }`}
              title={isSelectionMode ? "退出选择" : "选择任务"}
            >
              <CheckSquare size={18} className="sm:w-5 sm:h-5" />
            </button>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-500 bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="whitespace-nowrap">自动刷新</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`w-9 h-5 sm:w-10 sm:h-5 rounded-full transition-all relative ${
                autoRefresh ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                autoRefresh ? 'left-[18px] sm:left-[22px]' : 'left-0.5'
              }`} />
            </button>
          </div>

          <button 
            onClick={manualFetchData}
            className="p-2 sm:p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw size={18} className={`sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
        {/* Task Selection Header */}
        {hasTasksInView && isSelectionMode && (
          <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center gap-4">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  checked={isAllSelected}
                  ref={input => {
                    if (input) input.indeterminate = isIndeterminate;
                  }}
                  onChange={toggleSelectAllTasks}
                  disabled={deletableTasks.length === 0}
                />
              </div>
              <span className="text-sm font-medium text-slate-500">
                {selectedTaskIds.size > 0 ? `已选择 ${selectedTaskIds.size} 项任务` : '全选未运行任务'}
              </span>
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {logs.map((log, index) => {
            const isTask = !!log.task_id;
            const isSelected = isTask && selectedTaskIds.has(log.task_id as string);

            return (
              <div key={log.task_id || `log-${index}`} className={`p-4 sm:p-6 transition-colors ${
                isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
              }`}>
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-4 w-full sm:w-auto">
                    {isSelectionMode && isTask && (
                      <div className="flex items-center h-10 sm:h-12 shrink-0">
                        <input
                          type="checkbox"
                          className="w-5 h-5 sm:w-5 sm:h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed scale-90 sm:scale-100"
                          checked={isSelected}
                          onChange={() => toggleSelectTask(log.task_id as string)}
                          disabled={log.task_status === 'running'}
                        />
                      </div>
                    )}
                    
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      isTask ? (
                        (log.task_type === 'scan' || log.task_type === 'library_scan') ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20' : 
                        log.task_type === 'write_metadata' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' :
                        'bg-purple-50 text-purple-600 dark:bg-purple-900/20'
                      ) : (
                        'bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400'
                      )
                    }`}>
                      {getLogIcon(log.module)}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                        <span className="font-bold text-sm sm:text-base dark:text-white truncate">
                          {getModuleName(log.module)}
                        </span>
                        
                        <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-md shrink-0 ${getLevelColor(log.level)}`}>
                          {log.level}
                        </span>

                        {isTask && log.task_status && (
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md shrink-0 ${
                            log.task_status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                            log.task_status === 'failed' ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                            'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                          }`}>
                            {getTaskStatusText(log.task_status)}
                          </span>
                        )}
                        
                      </div>

                      {/* Display Log message or Task message */}
                      <p className={`text-sm break-all font-mono whitespace-pre-wrap mt-2 ${isTask ? 'text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                        {log.message}
                      </p>

                      {/* Task error state if present */}
                      {isTask && log.level === 'ERROR' && log.message.includes('错误') && (
                        <p className="text-xs text-red-500 mt-2 bg-red-50 dark:bg-red-900/10 p-2 rounded-lg border border-red-100 dark:border-red-900/20 break-all">
                          {log.message}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t border-slate-100 dark:border-slate-800 sm:border-none">
                    {isTask ? (
                      <>
                        <div className="flex items-center gap-2 sm:mb-1 order-2 sm:order-1">
                          <span className="text-xs text-slate-500 sm:hidden">{getTaskStatusText(log.task_status as string)}</span>
                          {getStatusIcon(log.task_status)}
                        </div>
                        
                        <div className="flex items-center gap-2 order-3 sm:order-2 mt-1 mb-1">
                          {(log.task_status === 'running' || log.task_status === 'queued') ? (
                            <button
                              onClick={() => handleCancelTask(log.task_id as string)}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="停止任务"
                            >
                              <StopCircle size={18} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteTask(log.task_id as string)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="删除记录"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="order-2 sm:order-1 h-8"></div>
                    )}

                    <div className="text-xs text-slate-400 order-1 sm:order-3">
                      {formatDate(log.timestamp)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {logs.length === 0 && !loading && (
          <div className="py-20 text-center">
            <Terminal size={48} className="mx-auto text-slate-200 mb-4" />
            <p className="text-slate-500 font-medium">暂无记录</p>
          </div>
        )}

        {loading && logs.length === 0 && (
          <div className="py-20 flex justify-center">
            <Loader2 size={32} className="text-primary-600 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};

export default LogsPage;
