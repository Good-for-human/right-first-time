interface ProgressBarProps {
  label: string;
  value: number;
  colorClass?: string;
}

export function ProgressBar({ label, value, colorClass = 'bg-[#0052D9]' }: ProgressBarProps) {
  return (
    <div className="flex-1">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="text-slate-800 font-semibold">{value}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full ${colorClass} transition-all duration-1000 ease-out`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
