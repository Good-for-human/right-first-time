import { create } from 'zustand';
import type {
  Task,
  TaskStatus,
  GeneratedContent,
  SectionMetadataMap,
  EvaluationReport,
  TranslationMap,
} from '@/types';
import { fsSetTask, fsDeleteTask } from '@/services/firestoreService';

// Per-task generated content cache (in-memory only, not synced to Firestore)
export interface TaskContent {
  generatedContent: GeneratedContent;
  sectionMetadata: SectionMetadataMap;
  evaluationReport: EvaluationReport;
  translations: TranslationMap;
}

interface TaskState {
  tasks: Task[];
  activeTaskId: string;
  contentCache: Record<string, TaskContent>;
  isLoading: boolean;

  // Bulk setter — used by the Firestore onSnapshot sync hook
  setTasks: (tasks: Task[]) => void;
  setLoading: (loading: boolean) => void;

  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  setActiveTaskId: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  setTaskContent: (taskId: string, content: TaskContent) => void;
  getTaskContent: (taskId: string) => TaskContent | undefined;
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  // Start empty — Firestore snapshot will populate
  tasks: [],
  activeTaskId: '',
  contentCache: {},
  isLoading: true,

  // ── Bulk setters (called by useFirestoreSync) ────────────
  setTasks: (tasks) => {
    const { activeTaskId } = get();
    // Keep the active selection valid; fall back to the first task
    const nextActiveId =
      tasks.some((t) => t.id === activeTaskId)
        ? activeTaskId
        : (tasks[0]?.id ?? '');
    set({ tasks, activeTaskId: nextActiveId });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  // ── Task mutations ───────────────────────────────────────
  addTask: (task) => {
    set((state) => ({ tasks: [task, ...state.tasks] }));
    fsSetTask(task);
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    const updated = get().tasks.find((t) => t.id === id);
    if (updated) fsSetTask(updated);
  },

  removeTask: (id) => {
    set((state) => {
      const remaining = state.tasks.filter((t) => t.id !== id);
      const nextActiveId =
        state.activeTaskId === id ? (remaining[0]?.id ?? '') : state.activeTaskId;
      const { [id]: _dropped, ...restCache } = state.contentCache;
      return { tasks: remaining, activeTaskId: nextActiveId, contentCache: restCache };
    });
    fsDeleteTask(id);
  },

  setActiveTaskId: (id) => set({ activeTaskId: id }),

  setTaskStatus: (id, status) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    }));
    const updated = get().tasks.find((t) => t.id === id);
    if (updated) fsSetTask(updated);
  },

  setTaskContent: (taskId, content) =>
    set((state) => ({
      contentCache: { ...state.contentCache, [taskId]: content },
    })),

  getTaskContent: (taskId) => get().contentCache[taskId],
}));
