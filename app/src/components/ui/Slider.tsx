import { formatEUR, formatPercent, formatNumber } from '../../lib/format';

interface SliderProps {
  id?: string;
  label?: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: 'EUR' | '%' | string;
  className?: string;
}

export function Slider({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  className = '',
}: SliderProps) {
  const getFormattedVal = (val: number) => {
    if (suffix === 'EUR') {
      return formatEUR(val, 0);
    }
    if (suffix === '%') {
      return formatPercent(val, 2);
    }
    if (suffix) {
      return `${formatNumber(val, 1)} ${suffix}`;
    }
    return formatNumber(val, 0);
  };

  return (
    <div className={`flex flex-col space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        {label && (
          <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </label>
        )}
        <span className="text-sm font-semibold tabular-nums text-slate-700">
          {getFormattedVal(value)}
        </span>
      </div>
      <div className="relative -my-3 flex items-center py-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600 transition-colors focus:outline-hidden [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-lg [&::-webkit-slider-runnable-track]:bg-slate-200 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110"
        />
      </div>
      <div className="flex justify-between text-[10px] font-medium text-slate-400">
        <span>{getFormattedVal(min)}</span>
        <span>{getFormattedVal(max)}</span>
      </div>
    </div>
  );
}
