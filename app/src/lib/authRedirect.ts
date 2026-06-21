export function buildAuthRedirectUrl(
  origin: string = window.location.origin,
  basePath: string = import.meta.env.BASE_URL || '/',
): string {
  const url = new URL(basePath || '/', origin);
  url.search = '';
  url.hash = '';
  return url.toString();
}
