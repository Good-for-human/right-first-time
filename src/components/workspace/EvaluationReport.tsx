import { useTranslation } from 'react-i18next';
import { ShieldAlert, AlertTriangle, RefreshCw, Loader2, BarChart2 } from 'lucide-react';
import { Badge, ProgressBar } from '@/components/ui';
import type { EvaluationReport as EvaluationReportType } from '@/types';

interface EvaluationReportProps {
  report?: EvaluationReportType | null;
  isLoading?: boolean;
  onReEvaluate?: () => void;
}

const RISK_COLORS: Record<string, 'green' | 'orange' | 'red'> = {
  Low: 'green',
  Medium: 'orange',
  High: 'red',
};

export function EvaluationReport({ report, isLoading = false, onReEvaluate }: EvaluationReportProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-5">
      <div className="flex justify-between items-center pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-1 rounded text-[#0052D9]">
            <ShieldAlert size={14} />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">{t('ws.report')}</h3>
        </div>
        <div className="flex items-center gap-3">
          {report && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">{t('ws.risk')}:</span>
              <Badge color={RISK_COLORS[report.riskLevel] ?? 'gray'} className="text-xs px-2 font-bold">
                {report.riskLevel}
              </Badge>
            </div>
          )}
          {onReEvaluate && (
            <button
              onClick={onReEvaluate}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-[#0052D9] hover:border-blue-200 rounded-md text-xs font-medium transition shadow-sm disabled:opacity-50"
            >
              {isLoading
                ? <Loader2 size={12} className="animate-spin text-[#0052D9]" />
                : <RefreshCw size={12} />
              }
              {t('ws.reEvaluate')}
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !report && (
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-400">
          <Loader2 size={24} className="animate-spin text-[#0052D9]" />
          <p className="text-sm">{t('ws.evaluating')}</p>
        </div>
      )}

      {/* No evaluation yet */}
      {!isLoading && !report && (
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-400">
          <BarChart2 size={24} className="opacity-40" />
          <p className="text-sm">{t('ws.noEvaluation')}</p>
          {onReEvaluate && (
            <button
              onClick={onReEvaluate}
              className="mt-1 flex items-center gap-1.5 px-4 py-2 bg-[#0052D9] text-white rounded-md text-xs font-medium hover:bg-blue-700 transition shadow-sm"
            >
              <BarChart2 size={12} />
              {t('ws.evaluateNow')}
            </button>
          )}
        </div>
      )}

      {/* Scores */}
      {report && (
        <>
          <div className="flex gap-6 w-full">
            <ProgressBar label={t('score.clarity')} value={report.scores.clarity} />
            <ProgressBar label={t('score.completeness')} value={report.scores.completeness} />
            <ProgressBar label={t('score.searchability')} value={report.scores.searchability} />
            <ProgressBar label={t('score.compliance')} value={report.scores.compliance} colorClass="bg-orange-500" />
          </div>

          {report.issues.length > 0 && (
            <div className="bg-orange-50 rounded border border-orange-100 p-3 space-y-1 mt-1">
              {report.issues.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-xs text-orange-800 font-medium">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{issue.type}: {issue.text}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
