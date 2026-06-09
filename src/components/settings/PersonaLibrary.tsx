import { useTranslation } from 'react-i18next';
import { Users, User, Plus, Edit3, Trash2 } from 'lucide-react';
import type { Persona, SystemLanguage, BusinessCountryCode, CountryCode } from '@/types';
import { localizeSystemText } from '@/lib/systemTextI18n';

interface PersonaLibraryProps {
  personas: Persona[];
  systemLanguage: SystemLanguage;
  localCountryCode?: BusinessCountryCode | null;
  onAdd: () => void;
  onEdit: (persona: Persona) => void;
  onDelete: (persona: Persona) => void;
}

export function PersonaLibrary({
  personas,
  systemLanguage,
  localCountryCode,
  onAdd,
  onEdit,
  onDelete,
}: PersonaLibraryProps) {
  const { t } = useTranslation();
  const getPersonaCountry = (persona: Persona): CountryCode =>
    (persona.createdByCountry ?? localCountryCode ?? 'GLOBAL') as CountryCode;
  // Local-only library: a country workspace manages only its own personas. GLOBAL and other
  // countries' personas are browsed and imported via the Shared Library (becoming local copies).
  const visiblePersonas = personas.filter((persona) => {
    if (!localCountryCode) return true;
    return getPersonaCountry(persona) === localCountryCode;
  });

  const renderCreator = (createdByEmail?: string, createdByCountry?: string) => {
    if (!createdByEmail && !createdByCountry) return null;
    const isDefault = createdByEmail === 'system@rightfirsttime.local' && createdByCountry === 'GLOBAL';
    return isDefault
      ? t('meta.default')
      : t('meta.createdBy', {
          email: createdByEmail ?? '-',
          country: createdByCountry ?? '-',
        });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-6">
      <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-purple-600" /> {t('set.persona')}
          </h3>
          <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">{t('set.personaDesc')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onAdd}
            className="px-4 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-sm font-medium rounded-md transition flex items-center gap-2"
          >
            <Plus size={14} /> {t('set.add')}
          </button>
        </div>
      </div>

      <div className="p-6">
        {visiblePersonas.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            {t('set.noPersona')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {visiblePersonas.map((p) => (
              <div
                key={p.id}
                className="border border-slate-200 rounded-xl p-4 bg-white hover:border-purple-300 hover:shadow-sm transition-all group relative"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                    <User size={14} />
                  </div>
                  <div className="pr-8">
                    <h4 className="font-semibold text-slate-800 text-[13px] mb-1.5">
                      {localizeSystemText(p.name, p.nameI18n, systemLanguage)}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {localizeSystemText(p.description, p.descriptionI18n, systemLanguage)}
                    </p>
                    {(p.createdByEmail || p.createdByCountry) && (
                      <p className="text-[11px] text-slate-400 mt-2">
                        {renderCreator(p.createdByEmail, p.createdByCountry)}
                      </p>
                    )}
                  </div>
                </div>
                {(!localCountryCode || getPersonaCountry(p) === localCountryCode) ? (
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
                ) : (
                  <span className="absolute top-3 right-3 text-[11px] text-slate-400">
                    {t('set.readonlyOtherRule')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
