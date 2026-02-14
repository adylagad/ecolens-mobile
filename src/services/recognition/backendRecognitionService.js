import { buildApiUrl } from '../../utils/apiUrl';

function toStringMessage(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function parseTimeoutMs() {
  const raw = String(process.env?.EXPO_PUBLIC_BACKEND_REQUEST_TIMEOUT_MS ?? '').trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30000;
  }
  return parsed;
}

export async function recognizeWithBackend({ payload, apiBaseUrl, authToken = '' }) {
  const endpoint = buildApiUrl(apiBaseUrl, '/api/recognize');
  const token = String(authToken ?? '').trim();
  const controller = new AbortController();
  let timeoutId = null;

  let response;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        const timeoutError = new Error('Backend recognition timed out. Please try again.');
        timeoutError.code = 'BACKEND_TIMEOUT';
        reject(timeoutError);
      }, parseTimeoutMs());
    });
    response = await Promise.race([fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }), timeoutPromise]);
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'BACKEND_TIMEOUT') {
      const timeoutError = new Error('Backend recognition timed out. Please try again.');
      timeoutError.code = 'BACKEND_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (parseError) {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(toStringMessage(data?.message, `Request failed (${response.status})`));
    error.code = response.status;
    throw error;
  }

  return {
    data,
    runtime: {
      engine: 'backend',
      endpoint,
    },
  };
}
