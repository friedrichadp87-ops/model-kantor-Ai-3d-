/**
 * Normalizes incoming request paths when Express runs behind Netlify Functions
 * (e.g. "/.netlify/functions/api/api/providers/status" or "/.netlify/functions/api/providers/status")
 * so every /api/* route matches identically on local Node.js, Cloud Run, and Netlify.
 */
export function normalizeNetlifyApiPath(rawUrl: string): string {
  const safe = rawUrl || '/';
  const queryIdx = safe.indexOf('?');
  const rawPath = queryIdx >= 0 ? safe.slice(0, queryIdx) : safe;
  const query = queryIdx >= 0 ? safe.slice(queryIdx) : '';

  const fnPrefix = '/.netlify/functions/api';
  let pathname = rawPath;

  if (pathname === fnPrefix || pathname === `${fnPrefix}/`) {
    return `/api${query}`;
  }

  if (pathname.startsWith(`${fnPrefix}/`)) {
    pathname = pathname.slice(fnPrefix.length);
  }

  if (pathname.startsWith('/api/api/')) {
    pathname = pathname.slice(4);
  } else if (pathname === '/api/api') {
    pathname = '/api';
  }

  if (!pathname.startsWith('/api') && rawPath.startsWith(fnPrefix)) {
    pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  }

  return `${pathname}${query}`;
}
