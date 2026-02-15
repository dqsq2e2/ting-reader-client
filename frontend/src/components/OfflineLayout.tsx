import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import Player from './Player';
import { usePlayerStore } from '../store/playerStore';

const OfflineLayout: React.FC = () => {
  const navigate = useNavigate();
  const { refreshTheme } = useTheme();
  const hasCurrentChapter = usePlayerStore(state => !!state.currentChapter);

  React.useEffect(() => {
    refreshTheme();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Minimal Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
             <WifiOff size={18} />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">离线模式</h1>
            <p className="text-[10px] text-slate-500 font-medium">仅本地功能可用</p>
          </div>
        </div>
        
        <button 
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={16} />
          返回登录
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        <div className="flex-1 overflow-y-auto">
           <Outlet />
        </div>
        {hasCurrentChapter && <Player />}
      </main>
    </div>
  );
};

export default OfflineLayout;
