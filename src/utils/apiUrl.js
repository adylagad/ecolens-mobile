function normalizeBaseUrl(baseUrl) {
  return String(baseUrl ?? '').trim().replace(/\/+$/, '');
}

export function buildApiUrl(baseUrl, path) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!normalizedBase) {
    return normalizedPath;
  }

  if (normalizedBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${normalizedBase}${normalizedPath.slice(4)}`;
  }
  return `${normalizedBase}${normalizedPath}`;
}

