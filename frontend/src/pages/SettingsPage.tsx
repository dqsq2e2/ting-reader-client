import React, { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import axios from 'axios';
import { useTheme } from '../hooks/useTheme';
import { usePlayerStore } from '../store/playerStore';
import { 
  Settings as SettingsIcon, 
  Moon, 
  Sun, 
  Monitor,
  FastForward,
  CheckCircle2,
  User,
  Key,
  Code,
  Copy,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

type SettingsPayload = {
  playback_speed: number;
  sleep_timer_default: number;
  auto_preload: boolean;
  auto_cache: boolean;
  theme: 'light' | 'dark' | 'system';
  widget_css: string;
};

type AccountUpdatePayload = {
  username?: string;
  password?: string;
};

const defaultSettings: SettingsPayload = {
  playback_speed: 1.0,
  sleep_timer_default: 0,
  auto_preload: false,
  auto_cache: false,
  theme: 'system',
  widget_css: ''
};

const SettingsPage: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const { applyTheme } = useTheme();
  const setPlaybackSpeed = usePlayerStore(state => state.setPlaybackSpeed);
  const [settings, setSettings] = useState<SettingsPayload>(defaultSettings);
  const [accountData, setAccountData] = useState({
    username: user?.username || '',
    password: ''
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [widgetEmbedType, setWidgetEmbedType] = useState<'private' | 'public'>('private');
  const [backendVersion, setBackendVersion] = useState<string>('');
  const [clientVersion, setClientVersion] = useState<string>('1.0.8'); // Default or read from env
  const [showAbout, setShowAbout] = useState(false);
  
  type UpdateInfo = {
    version: string;
    downloadUrl: Record<string, string>;
    size: Record<string, string>;
    date: string;
  };
  const [backendUpdateInfo, setBackendUpdateInfo] = useState<{version: string, date: string} | null>(null);
  const [checkingBackendUpdate, setCheckingBackendUpdate] = useState(false);
  const [clientUpdateInfo, setClientUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingClientUpdate, setCheckingClientUpdate] = useState(false);
  
  const fetchSettings = useCallback(async () => {
    try {
      const response = await apiClient.get<Partial<SettingsPayload>>('/api/settings');
      const fetchedSettings: SettingsPayload = {
        ...defaultSettings,
        playback_speed: response.data?.playbackSpeed ?? 1.0,
        sleep_timer_default: response.data?.sleepTimerDefault ?? 0,
        auto_preload: response.data?.settingsJson?.autoPreload !== undefined ? !!response.data.settingsJson.autoPreload : !!response.data?.autoPreload,
        auto_cache: response.data?.settingsJson?.autoCache !== undefined ? !!response.data.settingsJson.autoCache : !!response.data?.autoCache,
        theme: response.data?.theme ?? 'system',
        widget_css: response.data?.widgetCss ?? ''
      };
      setSettings(fetchedSettings);
      // Ensure local theme matches server theme
      if (fetchedSettings.theme) {
        applyTheme(fetchedSettings.theme);
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    fetchSettings();
    apiClient.get('/api/health').then(res => {
      if (res.data && res.data.version) {
        setBackendVersion(res.data.version);
      }
    }).catch(console.error);
    
    // Attempt to get version from Electron bridge if available, otherwise fallback
    if (window.electronAPI && window.electronAPI.getVersion) {
        window.electronAPI.getVersion().then(setClientVersion);
    }
  }, [fetchSettings]);

  const handleCheckBackendUpdate = async () => {
      if (checkingBackendUpdate || !backendVersion) return;
      setCheckingBackendUpdate(true);
      try {
          const { data } = await axios.get('https://www.tingreader.cn/api/fpk/docker');
          const remoteVersion = data.version.replace(/^v/, '');
          const currentVersion = backendVersion.replace(/^v/, '');
          
          if (remoteVersion !== currentVersion) {
              setBackendUpdateInfo(data);
          } else {
              const toast = document.createElement('div');
              toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg animate-in fade-in slide-in-from-bottom-4 z-50';
              toast.innerText = '服务端已是最新版本';
              document.body.appendChild(toast);
              setTimeout(() => {
                  toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-4');
                  setTimeout(() => toast.remove(), 300);
              }, 2000);
          }
      } catch (error) {
          console.error('Check backend update failed', error);
          alert('检查服务端更新失败，请稍后重试');
      } finally {
          setCheckingBackendUpdate(false);
      }
  };

  const handleCheckClientUpdate = async () => {
      if (checkingClientUpdate) return;
      setCheckingClientUpdate(true);
      try {
          const { data } = await axios.get('https://www.tingreader.cn/api/client/desktop');
          const remoteVersion = data.version.replace(/^v/, '');
          const currentVersion = clientVersion.replace(/^v/, '');
          
          if (remoteVersion !== currentVersion) {
              setClientUpdateInfo(data);
          } else {
              const toast = document.createElement('div');
              toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg animate-in fade-in slide-in-from-bottom-4 z-50';
              toast.innerText = '客户端已是最新版本';
              document.body.appendChild(toast);
              setTimeout(() => {
                  toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-4');
                  setTimeout(() => toast.remove(), 300);
              }, 2000);
          }
      } catch (error) {
          console.error('Check client update failed', error);
          alert('检查客户端更新失败，请稍后重试');
      } finally {
          setCheckingClientUpdate(false);
      }
  };
  
  const getPlatformDownloadUrl = (urls: Record<string, string>) => {
      // Simple heuristic based on user agent, or show all
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('win')) return { url: urls.winExe, type: 'Windows (exe)' };
      if (ua.includes('mac')) {
          return ua.includes('arm') || ua.includes('apple') 
            ? { url: urls.macArmDmg, type: 'macOS (Apple Silicon)' }
            : { url: urls.macIntelDmg, type: 'macOS (Intel)' };
      }
      if (ua.includes('linux')) return { url: urls.appImage, type: 'Linux (AppImage)' };
      return null;
  };

  const handleSave = async (newSettings: SettingsPayload) => {
    try {
      // Create a payload for the API that maps back to camelCase for the client interceptor to transform to snake_case
      // Actually, the interceptor transforms ALL keys to snake_case.
      // So if we pass `playback_speed` (snake), it might become `playback_speed` (snake).
      // BUT if we pass `playbackSpeed` (camel), it becomes `playback_speed` (snake).
      // The issue is likely that `newSettings` here uses snake_case keys because we defined SettingsPayload with snake_case.
      // However, `apiClient` response interceptor transforms incoming data to camelCase.
      // So `fetchSettings` receives camelCase data, but we force it into `SettingsPayload` (snake_case) type?
      // Wait, `response.data` is camelCased.
      // `fetchedSettings` mixes snake_case keys (from `defaultSettings` and `SettingsPayload` type) with values from `response.data`.
      // If `response.data` has `playbackSpeed`, `response.data.playback_speed` is undefined.
      // So `fetchedSettings.playback_speed` becomes undefined or default.
      
      // We should probably standardize on camelCase in the frontend state and map to snake_case only when sending?
      // OR, we fix the mapping in `fetchSettings` as done above.
      
      // Now for saving:
      // `newSettings` has snake_case keys (from `SettingsPayload`).
      // `apiClient` request interceptor transforms data to snake_case.
      // If we pass `playback_speed`, snakecase-keys might keep it as is or double underscore?
      // `snakecase-keys` usually preserves existing snake_case.
      
      await apiClient.post('/api/settings', newSettings);
      setSettings(newSettings);
      
      // Sync playback speed to player store immediately
      if (newSettings.playback_speed) {
        setPlaybackSpeed(newSettings.playback_speed);
      }

      // Apply theme immediately if it changed
      if (newSettings.theme) {
        applyTheme(newSettings.theme);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    }
  };

  const handleAccountUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updateData: AccountUpdatePayload = {};
      if (accountData.username !== user?.username) {
        updateData.username = accountData.username;
      }
      if (accountData.password) {
        updateData.password = accountData.password;
      }

      if (Object.keys(updateData).length === 0) {
        setAccountSaved(true);
        setTimeout(() => setAccountSaved(false), 2000);
        return;
      }

      await apiClient.patch('/api/me', updateData);

      // Update local user store if username changed
      if (updateData.username && user) {
        setUser({ ...user, username: accountData.username });
      }

      setAccountData({ ...accountData, password: '' });
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2000);
    } catch (err) {
      const errorWithResponse = err as { response?: { data?: { error?: string } } };
      alert(errorWithResponse.response?.data?.error || '更新失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-screen-2xl mx-auto p-4 sm:p-6 md:p-8 lg:p-10 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-bold dark:text-white flex items-center justify-center md:justify-start gap-3">
            <SettingsIcon size={28} className="text-primary-600 md:w-8 md:h-8" />
            个性化设置
          </h1>
          <p className="text-sm md:text-base text-slate-500 mt-1">定制您的听书体验</p>
        </div>
        {saved && (
          <div className="flex items-center justify-center gap-2 text-green-600 font-bold bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-xl animate-in fade-in slide-in-from-right-4">
            <CheckCircle2 size={18} />
            已保存
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Account Settings */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
              <User size={20} className="text-primary-500" />
              账号信息
            </h2>
            {accountSaved && (
              <span className="text-sm text-green-600 font-bold flex items-center gap-1">
                <CheckCircle2 size={14} />
                更新成功
              </span>
            )}
          </div>
          <form onSubmit={handleAccountUpdate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400">用户名</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={accountData.username}
                    onChange={e => setAccountData({...accountData, username: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400">修改密码 (留空则不修改)</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    value={accountData.password}
                    onChange={e => setAccountData({...accountData, password: e.target.value})}
                    placeholder="新密码"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button 
                type="submit"
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-500/30 transition-all text-sm"
              >
                更新账号信息
              </button>
            </div>
          </form>
        </section>

        {/* Appearance */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold dark:text-white mb-6 flex items-center gap-2">
            <Monitor size={20} className="text-blue-500" />
            外观展示
          </h2>
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            {[
              { id: 'light', icon: <Sun size={20} />, label: '浅色模式' },
              { id: 'dark', icon: <Moon size={20} />, label: '深色模式' },
              { id: 'system', icon: <Monitor size={20} />, label: '跟随系统' }
            ].map(theme => (
              <button
                key={theme.id}
                onClick={() => handleSave({ ...settings, theme: theme.id })}
                className={`flex flex-col items-center gap-2 md:gap-3 p-3 md:p-4 rounded-2xl border-2 transition-all ${
                  settings.theme === theme.id 
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-600' 
                    : 'border-slate-100 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {theme.icon}
                <span className="text-xs md:text-sm font-bold text-center leading-tight">{theme.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Playback Settings */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold dark:text-white mb-6 flex items-center gap-2">
            <FastForward size={20} className="text-orange-500" />
            播放偏好
          </h2>
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-bold dark:text-white">默认播放倍速</p>
                <p className="text-xs md:text-sm text-slate-500">所有书籍开始播放时的初始倍速</p>
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto w-full sm:w-auto">
                {[1.0, 1.25, 1.5, 2.0].map(speed => (
                  <button
                    key={speed}
                    onClick={() => handleSave({ ...settings, playback_speed: speed })}
                    className={`flex-1 sm:flex-none px-2 md:px-4 py-2 text-sm font-bold rounded-lg transition-all ${
                      settings.playback_speed === speed ? 'bg-white dark:bg-slate-700 shadow-sm text-primary-600' : 'text-slate-500'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold dark:text-white truncate">自动预加载下一章</p>
                <p className="text-xs md:text-sm text-slate-500 line-clamp-2">播放当前章节时，后台自动解密并缓冲下一章节</p>
              </div>
              <button
                onClick={() => handleSave({ ...settings, auto_preload: !settings.auto_preload })}
                className={`flex-shrink-0 w-12 md:w-14 h-7 md:h-8 rounded-full transition-all relative ${
                  settings.auto_preload ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <div className={`absolute top-1 w-5 md:w-6 h-5 md:h-6 bg-white rounded-full transition-all ${
                  settings.auto_preload ? 'left-6 md:left-7' : 'left-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex-1 min-w-0">
                <p className="font-bold dark:text-white truncate">服务端自动缓存 (WebDAV)</p>
                <p className="text-xs md:text-sm text-slate-500 line-clamp-2">
                  播放当前章节时，通知服务器预先缓存下一章节 (仅适用于 WebDAV 库)
                </p>
              </div>
              <button
                onClick={() => handleSave({ ...settings, auto_cache: !settings.auto_cache })}
                className={`flex-shrink-0 w-12 md:w-14 h-7 md:h-8 rounded-full transition-all relative ${
                  settings.auto_cache ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <div className={`absolute top-1 w-5 md:w-6 h-5 md:h-6 bg-white rounded-full transition-all ${
                  settings.auto_cache ? 'left-6 md:left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </section>

        {/* Widget Settings */}
        {user?.role === 'admin' && (
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold dark:text-white mb-6 flex items-center gap-2">
            <Code size={20} className="text-purple-500" />
            外挂组件 (Widget)
          </h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400">自定义 CSS 注入</label>
                <span className="text-[10px] text-slate-400 uppercase font-bold">针对 Widget 生效</span>
              </div>
              <textarea 
                value={settings.widget_css}
                onChange={e => setSettings({ ...settings, widget_css: e.target.value })}
                onBlur={() => handleSave(settings)}
                placeholder=".widget-mode { background: transparent !important; }"
                className="w-full h-32 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 dark:text-white font-mono text-sm"
              />
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase">嵌入代码 (Iframe)</p>
                
                <div className="flex bg-white dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setWidgetEmbedType('private')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      widgetEmbedType === 'private' 
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    免登录 (带 Token)
                  </button>
                  <button
                    onClick={() => setWidgetEmbedType('public')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      widgetEmbedType === 'public' 
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    需登录 (公开)
                  </button>
                </div>
              </div>

              <div className="relative group">
                <code className="text-[10px] md:text-xs text-slate-600 dark:text-slate-400 break-all bg-white dark:bg-slate-950 p-3 rounded-xl block border border-slate-100 dark:border-slate-900 font-mono leading-relaxed">
                  {`<iframe src="${window.location.origin}/widget${widgetEmbedType === 'private' ? `?token=${useAuthStore.getState().token}` : ''}" width="100%" height="150" frameborder="0" allow="autoplay; fullscreen"></iframe>`}
                </code>
                <button 
                  onClick={async () => {
                    const baseUrl = window.location.origin;
                    const token = widgetEmbedType === 'private' ? `?token=${useAuthStore.getState().token}` : '';
                    const embedCode = `<iframe src="${baseUrl}/widget${token}" width="100%" height="150" frameborder="0" allow="autoplay; fullscreen"></iframe>`;
                    try {
                      await navigator.clipboard.writeText(embedCode);
                      alert('已复制到剪贴板');
                    } catch (err) {
                      console.error('Failed to copy:', err);
                      alert('复制失败，请手动复制');
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-slate-500 hover:text-primary-600 rounded-lg transition-colors"
                  title="复制"
                >
                  <Copy size={14} />
                </button>
              </div>
              
              <div className="mt-3 flex gap-2">
                <div className="shrink-0 mt-0.5">
                  {widgetEmbedType === 'private' ? (
                    <Key size={12} className="text-orange-500" />
                  ) : (
                    <User size={12} className="text-blue-500" />
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  {widgetEmbedType === 'private' ? (
                    <>
                      <span className="font-bold text-orange-500">注意安全：</span>
                      此代码包含您的访问凭证。请仅将其嵌入到您信任的私有页面（如个人 Dashboard）。任何访问该页面的人都将拥有您的播放权限。
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-blue-500">公开模式：</span>
                      此代码不包含凭证，适合嵌入博客或公开网站。访客在首次使用时需要输入用户名和密码登录。
                    </>
                  )}
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">布局代码参考 (直接复制)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-900 group relative">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">1. 吸底模式 (Fixed Bottom)</p>
                    <code className="text-[10px] text-slate-600 dark:text-slate-400 font-mono block whitespace-pre overflow-x-auto">
{`<div style="position: fixed; bottom: 0; left: 0; width: 100%; z-index: 9999;">
  <iframe src="${window.location.origin}/widget${widgetEmbedType === 'private' ? `?token=${useAuthStore.getState().token}` : ''}" width="100%" height="150" frameborder="0" allow="autoplay; fullscreen"></iframe>
</div>`}
                    </code>
                    <button 
                      onClick={async () => {
                        const code = `<div style="position: fixed; bottom: 0; left: 0; width: 100%; z-index: 9999;">
  <iframe src="${window.location.origin}/widget${widgetEmbedType === 'private' ? `?token=${useAuthStore.getState().token}` : ''}" width="100%" height="150" frameborder="0" allow="autoplay; fullscreen"></iframe>
</div>`;
                        try {
                          await navigator.clipboard.writeText(code);
                          alert('已复制到剪贴板');
                        } catch (err) {
                          console.error('Failed to copy:', err);
                          alert('复制失败，请手动复制');
                        }
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-slate-500 hover:text-primary-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="复制"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  
                  <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-900 group relative">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">2. 右下角悬浮 (Floating Right)</p>
                    <code className="text-[10px] text-slate-600 dark:text-slate-400 font-mono block whitespace-pre overflow-x-auto">
{`<div style="position: fixed; bottom: 20px; right: 20px; width: 350px; height: 150px; z-index: 9999; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
  <iframe src="${window.location.origin}/widget${widgetEmbedType === 'private' ? `?token=${useAuthStore.getState().token}` : ''}" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen"></iframe>
</div>`}
                    </code>
                    <button 
                      onClick={async () => {
                        const code = `<div style="position: fixed; bottom: 20px; right: 20px; width: 350px; height: 150px; z-index: 9999; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
  <iframe src="${window.location.origin}/widget${widgetEmbedType === 'private' ? `?token=${useAuthStore.getState().token}` : ''}" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen"></iframe>
</div>`;
                        try {
                          await navigator.clipboard.writeText(code);
                          alert('已复制到剪贴板');
                        } catch (err) {
                          console.error('Failed to copy:', err);
                          alert('复制失败，请手动复制');
                        }
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-slate-500 hover:text-primary-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="复制"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        )}
      </div>

      <div className="text-center text-slate-400 text-sm py-8 pb-24 md:pb-8">
        <button 
            onClick={() => setShowAbout(true)}
            className="text-slate-400 hover:text-primary-600 transition-colors text-sm font-bold underline decoration-slate-300 dark:decoration-slate-700 underline-offset-4"
        >
            关于 Ting Reader
        </button>
        <p className="mt-4 text-xs opacity-60">©2026 Ting Reader.保留所有权利。</p>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800">
                <div className="text-center mb-6">
                    <img src="/logo.png" alt="Ting Reader Logo" className="w-16 h-16 mx-auto mb-4 rounded-2xl shadow-sm object-contain p-1" />
                    <h3 className="text-xl font-bold dark:text-white">关于 Ting Reader</h3>
                </div>
                
                <div className="space-y-4 mb-6">
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <span className="text-sm font-bold text-slate-500">服务端版本</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold dark:text-white">v{backendVersion || 'Unknown'}</span>
                            <button 
                                onClick={handleCheckBackendUpdate}
                                disabled={checkingBackendUpdate || !backendVersion}
                                className="text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-600 px-2 py-1 rounded-lg font-bold hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors disabled:opacity-50"
                            >
                                {checkingBackendUpdate ? '检查中...' : '检查更新'}
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <span className="text-sm font-bold text-slate-500">客户端版本</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold dark:text-white">v{clientVersion}</span>
                            <button 
                                onClick={handleCheckClientUpdate}
                                disabled={checkingClientUpdate}
                                className="text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-600 px-2 py-1 rounded-lg font-bold hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors disabled:opacity-50"
                            >
                                {checkingClientUpdate ? '检查中...' : '检查更新'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="text-center mb-6">
                    <span className="text-sm text-slate-500 mr-2">官网地址</span>
                    <a 
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            // Electron or Browser open external
                            if (window.electronAPI && window.electronAPI.openExternal) {
                                window.electronAPI.openExternal('https://www.tingreader.cn');
                            } else {
                                window.open('https://www.tingreader.cn', '_blank');
                            }
                        }}
                        className="text-sm text-primary-600 hover:text-primary-700 font-bold"
                    >
                        www.tingreader.cn
                    </a>
                </div>

                <button 
                    onClick={() => setShowAbout(false)}
                    className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                    关闭
                </button>
            </div>
        </div>
      )}

      {/* Backend Update Modal */}
      {backendUpdateInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                        <CheckCircle2 size={32} />
                    </div>
                    <h3 className="text-xl font-bold dark:text-white">发现服务端新版本 {backendUpdateInfo.version}</h3>
                    <p className="text-sm text-slate-500 mt-2">
                        发布时间: {new Date(backendUpdateInfo.date).toLocaleDateString()}
                    </p>
                </div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={() => setBackendUpdateInfo(null)}
                        className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        暂不更新
                    </button>
                    <button 
                        onClick={() => {
                            const url = 'https://www.tingreader.cn/guide/update';
                            if (window.electronAPI && window.electronAPI.openExternal) {
                                window.electronAPI.openExternal(url);
                            } else {
                                window.open(url, '_blank');
                            }
                            setBackendUpdateInfo(null);
                        }}
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
                    >
                        前往官网更新
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Client Update Modal */}
      {clientUpdateInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-green-600">
                        <CheckCircle2 size={32} />
                    </div>
                    <h3 className="text-xl font-bold dark:text-white">发现客户端新版本 {clientUpdateInfo.version}</h3>
                    <p className="text-sm text-slate-500 mt-2">
                        发布时间: {new Date(clientUpdateInfo.date).toLocaleDateString()}
                    </p>
                </div>
                
                <div className="flex flex-col gap-3">
                    {(() => {
                        const rec = getPlatformDownloadUrl(clientUpdateInfo.downloadUrl);
                        if (rec) {
                            return (
                                <button 
                                    onClick={() => {
                                        if (window.electronAPI && window.electronAPI.openExternal) {
                                            window.electronAPI.openExternal(rec.url);
                                        } else {
                                            window.open(rec.url, '_blank');
                                        }
                                    }}
                                    className="w-full py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30"
                                >
                                    下载 {rec.type}
                                </button>
                            );
                        }
                        // Fallback: show all relevant options or just a link to site
                        return Object.entries(clientUpdateInfo.downloadUrl).map(([key, url]) => (
                            <button 
                                key={key}
                                onClick={() => {
                                    if (window.electronAPI && window.electronAPI.openExternal) {
                                        window.electronAPI.openExternal(url);
                                    } else {
                                        window.open(url, '_blank');
                                    }
                                }}
                                className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm"
                            >
                                下载 {key}
                            </button>
                        ));
                    })()}
                    <button 
                        onClick={() => setClientUpdateInfo(null)}
                        className="w-full py-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold transition-colors"
                    >
                        暂不更新
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
