import { useTranslation } from 'react-i18next';
import { Users, User, Plus, Edit3, Trash2 } from 'lucide-react';
import type { Persona } from '@/types';

interface PersonaLibraryProps {
  personas: Persona[];
  onAdd: () => void;
  onEdit: (persona: Persona) => void;
  onDelete: (persona: Persona) => void;
}

export function PersonaLibrary({ personas, onAdd, onEdit, onDelete }: PersonaLibraryProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-6">
      <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-purple-600" /> {t('set.persona')}
          </h3>
          <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">{t('set.personaDesc')}</p>
        </div>
        <button
          onClick={onAdd}
          className="px-4 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-sm font-medium rounded-md transition flex items-center gap-2"
        >
          <Plus size={14} /> {t('set.add')}
        </button>
      </div>

      <div className="p-6">
        {personas.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            {t('set.noPersona')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {personas.map((p) => (
              <div
                key={p.id}
                className="border border-slate-200 rounded-xl p-4 bg-white hover:border-purple-300 hover:shadow-sm transition-all group relative"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                    <User size={14} />
                  </div>
                  <div className="pr-8">
                    <h4 className="font-semibold text-slate-800 text-[13px] mb-1.5">{p.name}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
                  </div>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1.5">
                  <button
                    onClick={() => onEdit(p)}
                    className="p-1.5 text-slate-400 hover:text-purple-600 bg-slate-50 hover:bg-purple-50 rounded"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(p)}
                    className="p-1.5 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
