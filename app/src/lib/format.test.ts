import { describe, it, expect } from 'vitest';
import { formatEUR, formatPercent, formatNumber, parseNumber } from './format';

describe('format utilities', () => {
  describe('formatEUR', () => {
    it('formats EUR correctly with no fraction digits', () => {
      // Use clean regex matching or normalize whitespace to avoid narrow failures on different node/browser versions
      const result = formatEUR(123456);
      expect(result.replace(/\s/g, ' ')).toMatch(/123\.456\s*€/);
    });

    it('formats EUR correctly with fraction digits', () => {
      const result = formatEUR(1234.56, 2);
      expect(result.replace(/\s/g, ' ')).toMatch(/1\.234,56\s*€/);
    });
  });

  describe('formatPercent', () => {
    it('formats percent correctly', () => {
      const result = formatPercent(3.5);
      expect(result.replace(/\s/g, ' ')).toMatch(/3,50\s*%/);
    });

    it('formats percent with custom precision', () => {
      const result = formatPercent(3.5678, 1);
      expect(result.replace(/\s/g, ' ')).toMatch(/3,6\s*%/);
    });
  });

  describe('formatNumber', () => {
    it('formats normal number with thousands separator', () => {
      const result = formatNumber(1234567);
      expect(result.replace(/\s/g, ' ')).toBe('1.234.567');
    });
  });

  describe('parseNumber', () => {
    it('parses standard German float string', () => {
      expect(parseNumber('1.234,56')).toBe(1234.56);
    });

    it('parses string with only comma decimal separator', () => {
      expect(parseNumber('1234,56')).toBe(1234.56);
    });

    it('parses string with dots as thousand separators and no decimal', () => {
      expect(parseNumber('1.234')).toBe(1234);
      expect(parseNumber('1.000.000')).toBe(1000000);
    });

    it('keeps simple dot decimals usable for quick input', () => {
      expect(parseNumber('3.5')).toBe(3.5);
    });

    it('parses numbers with spaces and currency symbols', () => {
      expect(parseNumber(' 1.234,56 € ')).toBe(1234.56);
      expect(parseNumber('3,5 %')).toBe(3.5);
    });

    it('handles negative numbers', () => {
      expect(parseNumber('-1.234,56')).toBe(-1234.56);
      expect(parseNumber('-1.234')).toBe(-1234);
    });
  });
});
