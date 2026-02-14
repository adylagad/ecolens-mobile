import { Platform } from 'react-native';
import { inferTaxonomyLeaf } from '../../config/taxonomy';
import { buildApiUrl } from '../../utils/apiUrl';

function toTrimmedString(value) {
  const text = String(value ?? '').trim();
  return text;
}

function normalizeConfidence(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(1, parsed));
}

export async function submitTrainingSample({
  apiBaseUrl,
  userId,
  imageBase64,
  predictedLabel,
  predictedConfidence,
  finalLabel,
  sourceEngine,
  sourceRuntime,
  appVersion = 'mobile-dev',
  userConfirmed = true,
}) {
  const normalizedFinalLabel = toTrimmedString(finalLabel);
  if (!normalizedFinalLabel) {
    return null;
  }

  const endpoint = buildApiUrl(apiBaseUrl, '/api/training/samples');
  const payload = {
    userId: toTrimmedString(userId) || 'anonymous',
    imageBase64: toTrimmedString(imageBase64),
    predictedLabel: toTrimmedString(predictedLabel),
    predictedConfidence: normalizeConfidence(predictedConfidence),
    finalLabel: normalizedFinalLabel,
    taxonomyLeaf: inferTaxonomyLeaf(normalizedFinalLabel),
    sourceEngine: toTrimmedString(sourceEngine) || 'unknown',
    sourceRuntime: toTrimmedString(sourceRuntime) || 'unknown',
    devicePlatform: Platform.OS,
    appVersion: toTrimmedString(appVersion) || 'mobile-dev',
    userConfirmed: Boolean(userConfirmed),
  };

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
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = String(data?.message ?? `Training sample save failed (${response.status})`).trim();
    const error = new Error(message || 'Training sample save failed.');
    error.code = response.status;
    throw error;
  }

  return data;
}
