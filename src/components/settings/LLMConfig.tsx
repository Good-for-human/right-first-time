import { useTranslation } from 'react-i18next';
import { Settings, ExternalLink } from 'lucide-react';
import type { AppSettings, LLMModel } from '@/types';

interface LLMConfigProps {
  appSettings: AppSettings;
  onChange: (partial: Partial<AppSettings>) => void;
}

type ProviderInfo = {
  name: string;
  color: string;          // Tailwind text color
  bg: string;             // Tailwind bg color
  border: string;         // Tailwind border color
  keyHint: string;        // placeholder / format hint
  keyUrl: string;         // link to get API key
  keyLabel: string;       // link text
};

const PROVIDER_INFO: Record<string, ProviderInfo> = {
  openai: {
    name: 'OpenAI',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyLabel: 'platform.openai.com',
  },
  anthropic: {
    name: 'Anthropic',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    keyHint: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyLabel: 'console.anthropic.com',
  },
  google: {
    name: 'Google',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    keyHint: 'AIza...',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyLabel: 'aistudio.google.com',
  },
};

function getProvider(model: LLMModel): ProviderInfo {
  if (model.startsWith('gpt')) return PROVIDER_INFO.openai;
  if (model.startsWith('claude')) return PROVIDER_INFO.anthropic;
  if (model.startsWith('gemini')) return PROVIDER_INFO.google;
  return PROVIDER_INFO.openai;
}

export function LLMConfig({ appSettings, onChange }: LLMConfigProps) {
  const { t } = useTranslation();
  const provider = getProvider(appSettings.model);

  return (
    <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
          <Settings size={18} className="text-[#0052D9]" /> {t('set.model')}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-6">
        {/* Model selector */}
        <div>
          <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('set.defaultModel')}</label>
          <select
            value={appSettings.model}
            onChange={(e) => onChange({ model: e.target.value as AppSettings['model'] })}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none bg-white"
          >
            <optgroup label="OpenAI">
              <option value="gpt-5.3-chat-latest" title="API: gpt-5.3-chat-latest">
                GPT-5.3 Chat · 速度快
              </option>
              <option value="gpt-5.4-pro" title="API: gpt-5.4-pro">
                GPT-5.4 Pro · 性能高
              </option>
            </optgroup>
            <optgroup label="Anthropic">
              <option value="claude-3-5-haiku">Claude 3.5 Haiku · 速度快</option>
              <option value="claude-3-7-sonnet">Claude 3.7 Sonnet · 性能高</option>
            </optgroup>
            <optgroup label="Google">
              <option value="gemini-3.1-flash" title="API: gemini-3.1-flash">
                Gemini 3.1 Flash · 速度快
              </option>
              <option value="gemini-3.1-pro" title="API: gemini-3.1-pro">
                Gemini 3.1 Pro · 性能高
              </option>
            </optgroup>
          </select>

          {/* Provider badge */}
          <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${provider.bg} ${provider.border} ${provider.color}`}>
            {provider.name} API
          </div>
        </div>

        {/* API Key */}
        <div>
          <div className="flex justify-between items-end mb-1.5">
            <label className="block text-[13px] font-medium text-slate-700">
              {provider.name} API 密钥
            </label>
            {appSettings.isSaved && (
              <button
                onClick={() => onChange({ isSaved: false, apiKey: '' })}
                className="text-xs text-[#0052D9] hover:underline"
              >
                {t('set.modifyKey')}
              </button>
            )}
          </div>
          <input
            type={appSettings.isSaved ? 'text' : 'password'}
            placeholder={provider.keyHint}
            value={appSettings.isSaved ? '••••••••••••••••••••••••' : appSettings.apiKey}
            onChange={(e) => onChange({ apiKey: e.target.value })}
            disabled={appSettings.isSaved}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none disabled:bg-slate-50 disabled:text-slate-400"
          />
          {/* Key acquisition link */}
          <a
            href={provider.keyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-1.5 inline-flex items-center gap-1 text-[11px] ${provider.color} hover:underline`}
          >
            <ExternalLink size={10} /> 获取 {provider.name} API 密钥 ({provider.keyLabel})
          </a>
        </div>
      </div>
    </div>
  );
}
