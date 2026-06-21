import { describe, expect, it } from 'vitest';
import { buildAuthRedirectUrl } from './authRedirect';

describe('buildAuthRedirectUrl', () => {
  it('keeps the configured Vite base path for production auth redirects', () => {
    expect(buildAuthRedirectUrl('https://example.com', '/Immo-Checker/')).toBe(
      'https://example.com/Immo-Checker/',
    );
  });

  it('falls back to the origin root when no base path is configured', () => {
    expect(buildAuthRedirectUrl('https://example.com', '/')).toBe('https://example.com/');
  });
});
