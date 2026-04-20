import { useTranslation } from 'react-i18next';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { Badge, ProgressBar } from '@/components/ui';
import type { EvaluationReport as EvaluationReportType } from '@/types';

interface EvaluationReportProps {
  report: EvaluationReportType;
}

const RISK_COLORS: Record<string, 'green' | 'orange' | 'red'> = {
  Low: 'green',
  Medium: 'orange',
  High: 'red',
};

export function EvaluationReport({ report }: EvaluationReportProps) {
  const { t } = useTranslation();
  const { scores, issues, riskLevel } = report;

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-5">
      <div className="flex justify-between items-center pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-1 rounded text-[#0052D9]">
            <ShieldAlert size={14} />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">{t('ws.report')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{t('ws.risk')}:</span>
          <Badge color={RISK_COLORS[riskLevel] ?? 'gray'} className="text-xs px-2 font-bold">
            {riskLevel}
          </Badge>
        </div>
      </div>

      <div className="flex gap-6 w-full">
        <ProgressBar label={t('score.clarity')} value={scores.clarity} />
        <ProgressBar label={t('score.completeness')} value={scores.completeness} />
        <ProgressBar label={t('score.searchability')} value={scores.searchability} />
        <ProgressBar label={t('score.compliance')} value={scores.compliance} colorClass="bg-orange-500" />
      </div>

      {issues.length > 0 && (
        <div className="bg-orange-50 rounded border border-orange-100 p-3 space-y-1 mt-1">
          {issues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-xs text-orange-800 font-medium">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{issue.type}: {issue.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
