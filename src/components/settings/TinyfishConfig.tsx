import { useTranslation } from 'react-i18next';
import { Cloud, Link } from 'lucide-react';
import type { AppSettings } from '@/types';

interface TinyfishConfigProps {
  appSettings: AppSettings;
  onChange: (partial: Partial<AppSettings>) => void;
}

export function TinyfishConfig({ appSettings, onChange }: TinyfishConfigProps) {
  const { t } = useTranslation();

  return (
    <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm mt-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
          <Cloud size={18} className="text-[#0052D9]" /> {t('set.fetchConfig')}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-[13px] text-slate-500 leading-relaxed mt-2">{t('set.tinyfishDesc')}</p>
          <a
            href="https://docs.tinyfish.ai/"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#0052D9] hover:underline mt-1 inline-flex items-center gap-1"
          >
            <Link size={10} /> docs.tinyfish.ai ↗
          </a>
        </div>
        <div>
          <div className="flex justify-between items-end mb-1.5">
            <label className="block text-[13px] font-medium text-slate-700">{t('set.tinyfishKey')}</label>
            {appSettings.isTinyfishSaved && (
              <button
                onClick={() => onChange({ isTinyfishSaved: false, tinyfishApiKey: '' })}
                className="text-xs text-[#0052D9] hover:underline"
              >
                {t('set.modifyKey')}
              </button>
            )}
          </div>
          <input
            type={appSettings.isTinyfishSaved ? 'text' : 'password'}
            placeholder="tf-..."
            value={appSettings.isTinyfishSaved ? '••••••••••••••••••••••••' : (appSettings.tinyfishApiKey || '')}
            onChange={(e) => onChange({ tinyfishApiKey: e.target.value })}
            disabled={appSettings.isTinyfishSaved}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
      </div>
    </div>
  );
}
