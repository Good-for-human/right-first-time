import type { BadgeColor } from '@/types';

const COLOR_CLASSES: Record<BadgeColor, string> = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  green:  'bg-green-50 text-green-700 border-green-200',
  red:    'bg-red-50 text-red-700 border-red-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  gray:   'bg-slate-100 text-slate-600 border-slate-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
};

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  className?: string;
}

export function Badge({ children, color = 'blue', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${COLOR_CLASSES[color]} ${className}`}
    >
      {children}
    </span>
  );
}
