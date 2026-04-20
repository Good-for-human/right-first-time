import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle, X, Star } from 'lucide-react';
import type { Task, ViewMode } from '@/types';

interface SidebarGroupProps {
  title: string;
  queue: Task[];
  icon?: LucideIcon;
  view: ViewMode;
  activeTaskId: string;
  setActiveTaskId: (id: string) => void;
  setView: (view: ViewMode) => void;
  onDeleteTask: (id: string) => void;
  onToggleBenchmark: (id: string, value: boolean) => void;
}

function StatusDot({ status }: { status: Task['status'] }) {
  if (status === 'archived') return <CheckCircle size={14} className="text-green-500" />;
  if (status === 'review') return <div className="w-2.5 h-2.5 rounded-full bg-orange-400" />;
  return <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />;
}

function TaskItem({
  task,
  isActive,
  onSelect,
  onDelete,
  onToggleBenchmark,
}: {
  task: Task;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggleBenchmark: (value: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  // ── Confirmation state ──────────────────────────────────────
  if (confirming) {
    return (
      <div
        className={`px-3 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-1 ${
          isActive ? 'bg-blue-50/70 border-blue-100' : 'bg-red-50/60 border-red-100'
        }`}
      >
        <span className="text-slate-600 truncate leading-tight">删除 <strong>{task.name || task.asin}</strong>？</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            className="px-2 py-0.5 rounded text-slate-500 hover:bg-slate-200 transition font-medium"
          >
            取消
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition font-medium"
          >
            删除
          </button>
        </div>
      </div>
    );
  }

  // ── Normal state ────────────────────────────────────────────
  return (
    <div className="relative group/item">
      <button
        onClick={onSelect}
        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition flex items-start border pr-14 ${
          isActive
            ? 'bg-blue-50/70 border-blue-100 shadow-sm'
            : 'hover:bg-slate-50 border-transparent'
        }`}
      >
        <div className="flex items-start gap-2.5 truncate w-full">
          <div className="mt-1 shrink-0">
            <StatusDot status={task.status} />
          </div>
          <div className="truncate flex-1 min-w-0">
            <div className={`font-medium truncate flex items-center gap-1 ${isActive ? 'text-[#0052D9]' : 'text-slate-700'}`}>
              {task.isBenchmark && (
                <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
              )}
              {task.name || task.asin}
            </div>
            {task.name && (
              <div className={`text-xs truncate mt-0.5 ${isActive ? 'text-blue-500/80' : 'text-slate-400'}`}>
                {task.asin}
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Benchmark star — always visible if active, otherwise on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleBenchmark(!task.isBenchmark); }}
        title={task.isBenchmark ? '取消标杆' : '设为标杆（AI重写时作为参考）'}
        className={`absolute right-7 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center transition-all ${
          task.isBenchmark
            ? 'text-amber-400 opacity-100'
            : 'text-slate-300 hover:text-amber-400 opacity-0 group-hover/item:opacity-100'
        }`}
      >
        <Star size={12} className={task.isBenchmark ? 'fill-amber-400' : ''} />
      </button>

      {/* Delete × button — visible on row hover */}
      <button
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
        title="删除任务"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center
          text-slate-300 hover:text-red-500 hover:bg-red-50
          opacity-0 group-hover/item:opacity-100 transition-all"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function SidebarGroup({
  title,
  queue,
  icon: Icon,
  view,
  activeTaskId,
  setActiveTaskId,
  setView,
  onDeleteTask,
  onToggleBenchmark,
}: SidebarGroupProps) {
  if (!queue || queue.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-4 flex items-center gap-1.5">
        {Icon && <Icon size={12} />}
        {title}
      </div>
      <div className="space-y-0.5 px-2">
        {queue.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            isActive={view === 'workspace' && activeTaskId === task.id}
            onSelect={() => { setActiveTaskId(task.id); setView('workspace'); }}
            onDelete={() => onDeleteTask(task.id)}
            onToggleBenchmark={(val) => onToggleBenchmark(task.id, val)}
          />
        ))}
      </div>
    </div>
  );
}
