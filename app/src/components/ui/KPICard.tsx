import { Card } from './Card';
import { Tooltip } from './Tooltip';
import { Info } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: 'positive' | 'negative' | 'neutral';
  tooltip?: string;
  className?: string;
}

export function KPICard({
  label,
  value,
  subtext,
  trend = 'neutral',
  tooltip,
  className = '',
}: KPICardProps) {
  const getTrendStyles = () => {
    switch (trend) {
      case 'positive':
        return {
          bg: 'bg-emerald-50/50 border-emerald-100',
          text: 'text-emerald-700',
          indicator: 'bg-emerald-500',
        };
      case 'negative':
        return {
          bg: 'bg-rose-50/50 border-rose-100',
          text: 'text-rose-700',
          indicator: 'bg-rose-500',
        };
      default:
        return {
          bg: 'bg-slate-50/30 border-slate-200/60',
          text: 'text-slate-600',
          indicator: 'bg-slate-400',
        };
    }
  };

  const trendStyles = getTrendStyles();

  return (
    <Card className={`overflow-hidden border p-5 ${trendStyles.bg} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </span>
          {tooltip && (
            <Tooltip content={tooltip} position="top">
              <button
                type="button"
                className="cursor-help rounded-full text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                aria-label={`${label} erklaeren`}
              >
                <Info size={14} />
              </button>
            </Tooltip>
          )}
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${trendStyles.indicator}`} />
      </div>
      <div className="mt-2.5 flex items-baseline justify-between">
        <span className="break-words text-xl font-bold tracking-tight text-slate-800 tabular-nums sm:text-2xl">
          {value}
        </span>
      </div>
      {subtext && (
        <span className={`mt-1.5 block text-xs font-medium ${trendStyles.text}`}>
          {subtext}
        </span>
      )}
    </Card>
  );
}
