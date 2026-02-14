import { Platform } from 'react-native';
import { recognizeWithBackend } from './backendRecognitionService';
import { recognizeOnDevice } from './onDeviceRecognitionService';

export const RECOGNITION_ENGINES = {
  AUTO: 'auto',
  ON_DEVICE: 'on-device',
  BACKEND: 'backend',
};

const DEFAULT_ON_DEVICE_FALLBACK_CONFIDENCE = 0.45;
const HARD_REJECT_ONDEVICE_CONFIDENCE = 0.3;

function normalizeEngine(engine) {
  const value = String(engine ?? '').trim().toLowerCase();
  if (value === RECOGNITION_ENGINES.ON_DEVICE) {
    return RECOGNITION_ENGINES.ON_DEVICE;
  }
  if (value === RECOGNITION_ENGINES.BACKEND) {
    return RECOGNITION_ENGINES.BACKEND;
  }
  return RECOGNITION_ENGINES.AUTO;
}

function parseFallbackThreshold() {
  const raw = String(process.env?.EXPO_PUBLIC_ONDEVICE_FALLBACK_CONFIDENCE ?? '').trim();
  if (!raw) {
    return DEFAULT_ON_DEVICE_FALLBACK_CONFIDENCE;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ON_DEVICE_FALLBACK_CONFIDENCE;
  }
  return Math.max(0, Math.min(1, parsed));
}

function parseConfidenceValue(result) {
  const raw = result?.data?.confidence;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  const parsed = Number.parseFloat(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLabelText(value) {
  const text = String(value ?? '').trim();
  return text;
}

function readTopPredictionLabel(result) {
  const topPredictions = Array.isArray(result?.data?.topPredictions) ? result.data.topPredictions : [];
  for (const item of topPredictions) {
    const candidate = normalizeLabelText(item?.name ?? item?.label ?? item?.className);
    if (candidate) {
      return candidate;
    }
  }
  return '';
}

function readOnDeviceLabel(result) {
  const direct = normalizeLabelText(result?.data?.name ?? result?.data?.label);
  if (direct) {
    return direct;
  }
  return readTopPredictionLabel(result);
}

function buildBackendFallbackPayload(payload, onDeviceResult) {
  const basePayload = {
    ...(payload ?? {}),
  };
  const existingLabel = normalizeLabelText(basePayload.detectedLabel);
  if (existingLabel) {
    return basePayload;
  }

  const onDeviceLabel = readOnDeviceLabel(onDeviceResult);
  if (onDeviceLabel) {
    return {
      ...basePayload,
      detectedLabel: onDeviceLabel,
      imageBase64: '',
    };
  }
  return basePayload;
}

async function fallbackToBackendOrThrow({
  payload,
  onDeviceResult,
  apiBaseUrl,
  authToken,
  onDeviceConfidence,
  fallbackThreshold,
  reasonPrefix = 'On-device confidence',
  allowOnDeviceDegrade = true,
}) {
  const fallbackPayload = buildBackendFallbackPayload(payload, onDeviceResult);
  try {
    const fallback = await recognizeWithBackend({ payload: fallbackPayload, apiBaseUrl, authToken });
    return {
      ...fallback,
      runtime: {
        ...fallback.runtime,
        fallbackFrom: RECOGNITION_ENGINES.ON_DEVICE,
        fallbackReason: `${reasonPrefix} ${onDeviceConfidence.toFixed(3)} below threshold ${fallbackThreshold.toFixed(3)}`,
        onDeviceConfidence,
        onDeviceFallbackThreshold: fallbackThreshold,
        backendFallbackMode:
          String(fallbackPayload?.imageBase64 ?? '').trim().length > 0
            ? 'image'
            : 'detected-label',
      },
    };
  } catch (backendFallbackError) {
    const canDegradeToOnDevice =
      allowOnDeviceDegrade &&
      onDeviceResult &&
      typeof onDeviceResult === 'object' &&
      Number.isFinite(onDeviceConfidence) &&
      onDeviceConfidence >= HARD_REJECT_ONDEVICE_CONFIDENCE;

    if (canDegradeToOnDevice) {
      return {
        ...onDeviceResult,
        runtime: {
          ...(onDeviceResult.runtime ?? {}),
          fallbackAttempted: true,
          fallbackFrom: RECOGNITION_ENGINES.ON_DEVICE,
          fallbackReason: `${reasonPrefix} ${onDeviceConfidence.toFixed(3)} below threshold ${fallbackThreshold.toFixed(3)}`,
          fallbackError: String(backendFallbackError?.message ?? 'Backend fallback failed'),
          onDeviceConfidence,
          onDeviceFallbackThreshold: fallbackThreshold,
          degradedToOnDevice: true,
        },
      };
    }

    const fallbackError = new Error(
      backendFallbackError?.message
        ? `Low-confidence on-device result rejected (${onDeviceConfidence.toFixed(3)}). Backend fallback failed: ${backendFallbackError.message}`
        : `Low-confidence on-device result rejected (${onDeviceConfidence.toFixed(3)}). Backend fallback failed.`
    );
    fallbackError.code = backendFallbackError?.code ?? 'BACKEND_FALLBACK_FAILED';
    throw fallbackError;
  }
}

export async function recognizeItem({
  payload,
  apiBaseUrl,
  preferredEngine = RECOGNITION_ENGINES.AUTO,
  authToken = '',
}) {
  const engine = normalizeEngine(preferredEngine);

  if (engine === RECOGNITION_ENGINES.BACKEND) {
    return recognizeWithBackend({ payload, apiBaseUrl, authToken });
  }

  if (engine === RECOGNITION_ENGINES.ON_DEVICE) {
    const onDeviceResult = await recognizeOnDevice({ payload });
    const onDeviceConfidence = parseConfidenceValue(onDeviceResult);
    const fallbackThreshold = parseFallbackThreshold();
    if (onDeviceConfidence === null || onDeviceConfidence >= fallbackThreshold) {
      return onDeviceResult;
    }
    return fallbackToBackendOrThrow({
      payload,
      onDeviceResult,
      apiBaseUrl,
      authToken,
      onDeviceConfidence,
      fallbackThreshold,
    });
  }

  if (Platform.OS === 'ios') {
    const fallbackThreshold = parseFallbackThreshold();
    try {
      const onDeviceResult = await recognizeOnDevice({ payload });
      const onDeviceConfidence = parseConfidenceValue(onDeviceResult);
      const shouldFallback =
        onDeviceConfidence !== null && onDeviceConfidence < fallbackThreshold;

      if (!shouldFallback) {
        return onDeviceResult;
      }

      return fallbackToBackendOrThrow({
        payload,
        onDeviceResult,
        apiBaseUrl,
        authToken,
        onDeviceConfidence,
        fallbackThreshold,
      });
    } catch (onDeviceError) {
      const fallback = await recognizeWithBackend({ payload, apiBaseUrl, authToken });
      return {
        ...fallback,
        runtime: {
          ...fallback.runtime,
          fallbackFrom: RECOGNITION_ENGINES.ON_DEVICE,
          fallbackReason: String(onDeviceError?.message ?? 'On-device path failed'),
        },
      };
    }
  }

  return recognizeWithBackend({ payload, apiBaseUrl, authToken });
}
