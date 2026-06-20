import { useState, useEffect, useRef } from 'react';
import { formatEUR, formatPercent, formatNumber, parseNumber } from '../../lib/format';

interface NumberInputProps {
  id?: string;
  label?: string;
  value: number;
  onChange: (val: number) => void;
  suffix?: 'EUR' | '%' | string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  error?: string;
  placeholder?: string;
}

export function NumberInput({
  id,
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step,
  className = '',
  error,
  placeholder = '',
}: NumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper to format the value for display when NOT focused
  const getDisplayValue = (val: number) => {
    if (suffix === 'EUR') {
      return formatEUR(val, 0);
    }
    if (suffix === '%') {
      return formatPercent(val, 2);
    }
    if (suffix) {
      return `${formatNumber(val, 0)} ${suffix}`;
    }
    return formatNumber(val, 0);
  };

  // Helper to format the value for editing when FOCUSED (e.g. 100000 or 3.5 represented in German format as "3,5")
  const getEditValue = (val: number) => {
    if (val === 0) return '';
    return val.toString().replace('.', ',');
  };

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(getDisplayValue(value));
    }
  }, [value, isFocused, suffix]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    setLocalValue(rawInput);
    
    // Parse on the fly to propagate up, but allow partial typing like "123,"
    if (rawInput.endsWith(',') || rawInput.endsWith('.')) {
      return;
    }
    
    const parsed = parseNumber(rawInput);
    if (!isNaN(parsed)) {
      let constrained = parsed;
      if (min !== undefined && parsed < min) constrained = min;
      if (max !== undefined && parsed > max) constrained = max;
      onChange(constrained);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setLocalValue(getEditValue(value));
    // Select all on focus for easier replacement
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseNumber(localValue);
    let constrained = isNaN(parsed) ? 0 : parsed;
    if (min !== undefined && constrained < min) constrained = min;
    if (max !== undefined && constrained > max) constrained = max;
    onChange(constrained);
    setLocalValue(getDisplayValue(constrained));
  };

  return (
    <div className={`flex flex-col space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </label>
      )}
      <div className="relative rounded-xl shadow-xs">
        <input
          ref={inputRef}
          type="text"
          id={id}
          value={localValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          step={step}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 transition-all duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden ${
            error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : ''
          }`}
        />
      </div>
      {error && <span className="text-xs font-medium text-red-500">{error}</span>}
    </div>
  );
}
