import { Card } from './Card';
import { Tooltip } from './Tooltip';

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
              <span className="cursor-help text-xs text-slate-400 hover:text-slate-600">
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
              </span>
            </Tooltip>
          )}
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${trendStyles.indicator}`} />
      </div>
      <div className="mt-2.5 flex items-baseline justify-between">
        <span className="text-2xl font-bold tracking-tight text-slate-800 tabular-nums">
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
