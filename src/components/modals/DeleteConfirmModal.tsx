import { useTranslation } from 'react-i18next';

interface DeleteConfirmModalProps {
  name: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({ onClose, onConfirm }: DeleteConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center animate-in fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="p-6">
          <h3 className="font-bold text-slate-800 mb-2">{t('modal.delete')}</h3>
          <p className="text-sm text-slate-600">{t('modal.deleteConfirm')}</p>
          <div className="pt-5 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
            >
              {t('modal.cancel')}
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
            >
              {t('modal.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
