import { Platform } from 'react-native';
import { recognizeWithBackend } from './backendRecognitionService';
import { recognizeOnDevice } from './onDeviceRecognitionService';

export const RECOGNITION_ENGINES = {
  AUTO: 'auto',
  ON_DEVICE: 'on-device',
  BACKEND: 'backend',
};

const DEFAULT_ON_DEVICE_FALLBACK_CONFIDENCE = 0.45;

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
    return recognizeOnDevice({ payload });
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

      try {
        const fallback = await recognizeWithBackend({ payload, apiBaseUrl, authToken });
        return {
          ...fallback,
          runtime: {
            ...fallback.runtime,
            fallbackFrom: RECOGNITION_ENGINES.ON_DEVICE,
            fallbackReason: `On-device confidence ${onDeviceConfidence.toFixed(3)} below threshold ${fallbackThreshold.toFixed(3)}`,
            onDeviceConfidence,
            onDeviceFallbackThreshold: fallbackThreshold,
          },
        };
      } catch (backendFallbackError) {
        return {
          ...onDeviceResult,
          runtime: {
            ...onDeviceResult.runtime,
            fallbackAttempted: true,
            fallbackFrom: RECOGNITION_ENGINES.ON_DEVICE,
            fallbackReason: `On-device confidence ${onDeviceConfidence.toFixed(3)} below threshold ${fallbackThreshold.toFixed(3)}`,
            fallbackError: String(backendFallbackError?.message ?? 'Backend fallback failed'),
            onDeviceConfidence,
            onDeviceFallbackThreshold: fallbackThreshold,
          },
        };
      }
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
