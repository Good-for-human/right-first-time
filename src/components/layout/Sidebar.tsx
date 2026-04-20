import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, LayoutDashboard, Archive, Settings, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { SidebarGroup } from './SidebarGroup';
import type { Task, ViewMode } from '@/types';

interface SidebarProps {
  tasks: Task[];
  activeTaskId: string;
  view: ViewMode;
  setActiveTaskId: (id: string) => void;
  setView: (view: ViewMode) => void;
  onNewTask: () => void;
  onDeleteTask: (id: string) => void;
  onToggleBenchmark: (id: string, value: boolean) => void;
}

export function Sidebar({ tasks, activeTaskId, view, setActiveTaskId, setView, onNewTask, onDeleteTask, onToggleBenchmark }: SidebarProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const user = useAuthStore((s) => s.user);

  const filterBySearch = (task: Task) =>
    task.asin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (task.name && task.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const activeQueue = tasks.filter(
    (t) => ['pending', 'fetched', 'review'].includes(t.status) && filterBySearch(t)
  );
  const archivedQueue = tasks.filter(
    (t) => t.status === 'archived' && filterBySearch(t)
  );

  const hasNoResults = searchTerm && tasks.filter(filterBySearch).length === 0;

  // ── Collapsed rail ──────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="w-14 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-sm transition-all duration-200 relative">
        {/* Logo icon */}
        <div className="h-[61px] border-b border-slate-100 flex items-center justify-center">
          <img src="/logo.png" alt="logo" className="w-7 h-7 object-contain" />
        </div>

        {/* New task (icon only) */}
        <div className="px-2 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-center">
          <button
            onClick={onNewTask}
            title={t('sidebar.newTask')}
            className="w-9 h-9 bg-[#0052D9] text-white rounded-md flex items-center justify-center hover:bg-blue-800 transition shadow-sm"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Task icons */}
        <div className="flex-1 overflow-y-auto py-3 flex flex-col items-center gap-1 px-2">
          {tasks.filter((t) => ['pending', 'fetched', 'review'].includes(t.status)).map((task) => (
            <button
              key={task.id}
              title={task.name || task.asin}
              onClick={() => { setActiveTaskId(task.id); setView('workspace'); }}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold transition border ${
                view === 'workspace' && activeTaskId === task.id
                  ? 'bg-blue-50 border-blue-200 text-[#0052D9]'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:border-slate-200'
              }`}
            >
              <LayoutDashboard size={15} />
            </button>
          ))}
          {tasks.filter((t) => t.status === 'archived').map((task) => (
            <button
              key={task.id}
              title={task.name || task.asin}
              onClick={() => { setActiveTaskId(task.id); setView('workspace'); }}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition border ${
                view === 'workspace' && activeTaskId === task.id
                  ? 'bg-blue-50 border-blue-200 text-[#0052D9]'
                  : 'border-transparent text-slate-400 hover:bg-slate-50 hover:border-slate-200'
              }`}
            >
              <Archive size={15} />
            </button>
          ))}
        </div>

        {/* Settings icon */}
        <div className="px-2 py-3 border-t border-slate-100 bg-slate-50 flex flex-col items-center gap-2 shrink-0">
          <button
            title={t('sidebar.settings')}
            onClick={() => setView('rules')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition border ${
              view === 'rules'
                ? 'bg-blue-100 border-blue-200 text-[#0052D9]'
                : 'border-transparent text-slate-500 hover:bg-white hover:border-slate-200 hover:shadow-sm'
            }`}
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setCollapsed(false)}
          title="展开侧边栏"
          className="absolute -right-3 top-[72px] w-6 h-6 bg-white border border-slate-200 rounded-full shadow-sm flex items-center justify-center text-slate-400 hover:text-[#0052D9] hover:border-blue-300 transition z-30"
        >
          <ChevronRight size={12} />
        </button>
      </div>
    );
  }

  // ── Expanded sidebar ────────────────────────────────────────
  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-sm transition-all duration-200 relative">
      {/* Logo + collapse button */}
      <div className="p-5 border-b border-slate-100 flex items-center gap-2.5">
        <img src="/logo.png" alt="Right First Time" className="w-7 h-7 object-contain shrink-0" />
        <h1 className="text-[15px] font-bold tracking-tight text-[#0052D9] flex-1 truncate">
          {t('app.title')}
        </h1>
        <button
          onClick={() => setCollapsed(true)}
          title="收起侧边栏"
          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition shrink-0"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* New task button */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <button
          onClick={onNewTask}
          className="w-full bg-[#0052D9] text-white py-2 rounded-md text-[13px] font-semibold hover:bg-blue-800 transition flex justify-center items-center gap-2 shadow-sm"
        >
          <Plus size={16} />
          {t('sidebar.newTask')}
        </button>
      </div>

      {/* Search + task list */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="p-3 border-b border-slate-100 shrink-0 sticky top-0 bg-white z-10">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('sidebar.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-[#0052D9] outline-none transition-all shadow-inner"
            />
          </div>
        </div>

        <div className="py-4 flex-1 overflow-y-auto">
          <SidebarGroup
            title={t('sidebar.review')}
            queue={activeQueue}
            icon={LayoutDashboard}
            view={view}
            activeTaskId={activeTaskId}
            setActiveTaskId={setActiveTaskId}
            setView={setView}
            onDeleteTask={onDeleteTask}
            onToggleBenchmark={onToggleBenchmark}
          />
          <SidebarGroup
            title={t('sidebar.archived')}
            queue={archivedQueue}
            icon={Archive}
            view={view}
            activeTaskId={activeTaskId}
            setActiveTaskId={setActiveTaskId}
            setView={setView}
            onDeleteTask={onDeleteTask}
            onToggleBenchmark={onToggleBenchmark}
          />
          {hasNoResults && (
            <div className="text-xs text-center text-slate-400 py-6">
              {t('sidebar.noResults')}
            </div>
          )}
        </div>
      </div>

      {/* Settings nav + user info */}
      <div className="p-3 border-t border-slate-100 bg-slate-50 shrink-0 space-y-1">
        <button
          onClick={() => setView('rules')}
          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2.5 ${
            view === 'rules'
              ? 'bg-blue-100 text-[#0052D9]'
              : 'text-slate-600 hover:bg-white hover:shadow-sm border border-transparent'
          }`}
        >
          <Settings size={16} />
          {t('sidebar.settings')}
        </button>

        {/* User email + sign out */}
        {user && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-400 truncate" title={user.email ?? ''}>
                {user.email}
              </p>
            </div>
            <button
              onClick={() => signOut(auth)}
              title="退出登录"
              className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
