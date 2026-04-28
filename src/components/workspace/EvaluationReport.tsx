import { useTranslation } from 'react-i18next';
import { ShieldAlert, AlertTriangle, RefreshCw, Loader2, BarChart2, CheckCircle2 } from 'lucide-react';
import type { EvaluationReport as EvaluationReportType } from '@/types';

interface EvaluationReportProps {
  report?: EvaluationReportType | null;
  isLoading?: boolean;
  onReEvaluate?: () => void;
}

export function EvaluationReport({ report, isLoading = false, onReEvaluate }: EvaluationReportProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-1 rounded text-[#0052D9]">
            <ShieldAlert size={14} />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">{t('ws.report')}</h3>
        </div>
        {onReEvaluate && (
          <button
            onClick={onReEvaluate}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-[#0052D9] hover:border-blue-200 rounded-md text-xs font-medium transition shadow-sm disabled:opacity-50"
          >
            {isLoading
              ? <Loader2 size={12} className="animate-spin text-[#0052D9]" />
              : <RefreshCw size={12} />}
            {t('ws.reEvaluate')}
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && !report && (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
          <Loader2 size={22} className="animate-spin text-[#0052D9]" />
          <p className="text-xs">{t('ws.evaluating')}</p>
        </div>
      )}

      {/* No evaluation yet */}
      {!isLoading && !report && (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
          <BarChart2 size={22} className="opacity-40" />
          <p className="text-xs">{t('ws.noEvaluation')}</p>
          {onReEvaluate && (
            <button
              onClick={onReEvaluate}
              className="mt-1 flex items-center gap-1.5 px-4 py-2 bg-[#0052D9] text-white rounded-md text-xs font-medium hover:bg-blue-700 transition shadow-sm"
            >
              <BarChart2 size={12} /> {t('ws.evaluateNow')}
            </button>
          )}
        </div>
      )}

      {/* Issues list */}
      {report && (
        report.issues.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-emerald-700">
            <CheckCircle2 size={16} className="shrink-0" />
            <span className="text-sm font-medium">{t('ws.evalNoIssues')}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {report.issues.map((issue, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-sm ${
                  issue.type === 'Error'
                    ? 'bg-red-50 border-red-100 text-red-800'
                    : 'bg-orange-50 border-orange-100 text-orange-800'
                }`}
              >
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold mr-1">{issue.type}:</span>
                  {issue.text}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
