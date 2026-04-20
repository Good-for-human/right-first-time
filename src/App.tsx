import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Workspace } from '@/components/workspace/Workspace';
import { SettingsAndRules } from '@/components/settings/SettingsAndRules';
import { CreateTaskModal } from '@/components/modals/CreateTaskModal';
import { PersonaModal } from '@/components/modals/PersonaModal';
import { RuleModal } from '@/components/modals/RuleModal';
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal';
import { AddCategoryModal } from '@/components/modals/AddCategoryModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { useTaskStore } from '@/store/taskStore';
import { useRulesStore } from '@/store/rulesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useFirestoreSync } from '@/lib/useFirestoreSync';
import type { Persona, Rule, Task, ViewMode } from '@/types';

type ModalState =
  | { type: 'none' }
  | { type: 'createTask' }
  | { type: 'addPersona' }
  | { type: 'editPersona'; persona: Persona }
  | { type: 'deletePersona'; persona: Persona }
  | { type: 'addRule'; ruleType: Rule['type']; category: string }
  | { type: 'editRule'; rule: Rule }
  | { type: 'deleteRule'; rule: Rule }
  | { type: 'addCategory' }
  | { type: 'deleteCategory'; name: string };

export default function App() {
  const { tasks, activeTaskId, isLoading, addTask, updateTask, removeTask, setActiveTaskId } = useTaskStore();
  const { categories, rules, personas, addCategory, removeCategory, addRule, updateRule, removeRule, addPersona, updatePersona, removePersona } = useRulesStore();
  const { appSettings, setAppSettings, persistAppSettings } = useSettingsStore();
  const { user, authLoading } = useAuthStore();

  // Bootstrap Auth listener + Firestore real-time sync
  useFirestoreSync();

  const [view, setView] = useState<ViewMode>('workspace');
  const [modal, setModal] = useState<ModalState>({ type: 'none' });

  const activeTask = tasks.find((t) => t.id === activeTaskId);
  const closeModal = () => setModal({ type: 'none' });

  // ── 1. Checking auth state ───────────────────────────────────
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F9FC]">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <img src="/logo.png" alt="logo" className="w-12 h-12 object-contain animate-pulse" />
          <p className="text-sm font-medium tracking-wide">正在验证身份…</p>
        </div>
      </div>
    );
  }

  // ── 2. Not logged in → show auth screen ─────────────────────
  if (!user) {
    return <AuthModal />;
  }

  // ── 3. Logged in but Firestore data still loading ────────────
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F9FC]">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <img src="/logo.png" alt="logo" className="w-12 h-12 object-contain animate-pulse" />
          <p className="text-sm font-medium tracking-wide">正在加载数据…</p>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[#F7F9FC] font-sans text-slate-900 overflow-hidden">
      <Sidebar
        tasks={tasks}
        activeTaskId={activeTaskId}
        view={view}
        setActiveTaskId={setActiveTaskId}
        setView={setView}
        onNewTask={() => setModal({ type: 'createTask' })}
        onDeleteTask={(id) => removeTask(id)}
        onToggleBenchmark={(id, val) => updateTask(id, { isBenchmark: val })}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {view === 'workspace' ? (
          <Workspace
            task={activeTask}
            updateTask={updateTask}
            categories={categories}
            personas={personas}
            appSettings={appSettings}
            setAppSettings={setAppSettings}
            rules={rules}
          />
        ) : (
          <SettingsAndRules
            appSettings={appSettings}
            setAppSettings={setAppSettings}
            persistAppSettings={persistAppSettings}
            categories={categories}
            rules={rules}
            personas={personas}
            tasks={tasks}
            onAddCategory={() => setModal({ type: 'addCategory' })}
            onDeleteCategory={(name) => setModal({ type: 'deleteCategory', name })}
            onAddRule={(ruleType, category) => setModal({ type: 'addRule', ruleType, category })}
            onEditRule={(rule) => setModal({ type: 'editRule', rule })}
            onDeleteRule={(rule) => setModal({ type: 'deleteRule', rule })}
            onAddPersona={() => setModal({ type: 'addPersona' })}
            onEditPersona={(persona) => setModal({ type: 'editPersona', persona })}
            onDeletePersona={(persona) => setModal({ type: 'deletePersona', persona })}
          />
        )}
      </div>

      {/* === Modals === */}

      {modal.type === 'createTask' && (
        <CreateTaskModal
          categories={categories}
          appSettings={appSettings}
          onClose={closeModal}
          onCreate={(data) => {
            const newTask: Task = {
              ...data,
              id: Date.now().toString(),
              createdAt: new Date().toISOString(),
            };
            addTask(newTask);
            setActiveTaskId(newTask.id);
            setView('workspace');
          }}
        />
      )}

      {(modal.type === 'addPersona' || modal.type === 'editPersona') && (
        <PersonaModal
          existing={modal.type === 'editPersona' ? modal.persona : undefined}
          onClose={closeModal}
          onSave={(data) => {
            if (modal.type === 'editPersona') {
              updatePersona(modal.persona.id, data);
            } else {
              addPersona(data);
            }
          }}
        />
      )}

      {modal.type === 'deletePersona' && (
        <DeleteConfirmModal
          name={modal.persona.name}
          onClose={closeModal}
          onConfirm={() => removePersona(modal.persona.id)}
        />
      )}

      {(modal.type === 'addRule' || modal.type === 'editRule') && (
        <RuleModal
          type={modal.type === 'addRule' ? modal.ruleType : modal.rule.type}
          existing={modal.type === 'editRule' ? modal.rule : undefined}
          archivedTasks={tasks.filter((t) => t.status === 'archived')}
          category={modal.type === 'editRule' ? modal.rule.category : modal.category}
          onClose={closeModal}
          onSave={(data) => {
            if (modal.type === 'editRule') {
              updateRule(modal.rule.id, data);
            } else {
              addRule({ ...data, active: true });
            }
          }}
        />
      )}

      {modal.type === 'deleteRule' && (
        <DeleteConfirmModal
          name={modal.rule.name}
          onClose={closeModal}
          onConfirm={() => removeRule(modal.rule.id)}
        />
      )}

      {modal.type === 'addCategory' && (
        <AddCategoryModal
          onClose={closeModal}
          onSave={(name) => {
            addCategory(name);
          }}
        />
      )}

      {modal.type === 'deleteCategory' && (
        <DeleteConfirmModal
          name={modal.name}
          onClose={closeModal}
          onConfirm={() => {
            removeCategory(modal.name);
          }}
        />
      )}
    </div>
  );
}
