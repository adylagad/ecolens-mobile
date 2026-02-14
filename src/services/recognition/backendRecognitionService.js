import { buildApiUrl } from '../../utils/apiUrl';

function toStringMessage(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export async function recognizeWithBackend({ payload, apiBaseUrl }) {
  const endpoint = buildApiUrl(apiBaseUrl, '/api/recognize');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

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
