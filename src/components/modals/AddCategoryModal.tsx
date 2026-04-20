import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface AddCategoryModalProps {
  onClose: () => void;
  onSave: (name: string) => void;
}

export function AddCategoryModal({ onClose, onSave }: AddCategoryModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden animate-in zoom-in-95">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800">{t('set.addCategory')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="..."
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] outline-none shadow-inner"
          />
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">
              {t('modal.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-5 py-2 text-sm font-medium text-white bg-[#0052D9] hover:bg-blue-800 rounded-md disabled:opacity-50"
            >
              {t('modal.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
