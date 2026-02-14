import { Platform } from 'react-native';
import { recognizeWithBackend } from './backendRecognitionService';
import { recognizeOnDevice } from './onDeviceRecognitionService';

export const RECOGNITION_ENGINES = {
  AUTO: 'auto',
  ON_DEVICE: 'on-device',
  BACKEND: 'backend',
};

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

export async function recognizeItem({ payload, apiBaseUrl, preferredEngine = RECOGNITION_ENGINES.AUTO }) {
  const engine = normalizeEngine(preferredEngine);

  if (engine === RECOGNITION_ENGINES.BACKEND) {
    return recognizeWithBackend({ payload, apiBaseUrl });
  }

  if (engine === RECOGNITION_ENGINES.ON_DEVICE) {
    return recognizeOnDevice({ payload });
  }

  if (Platform.OS === 'ios') {
    try {
      return await recognizeOnDevice({ payload });
    } catch (onDeviceError) {
      const fallback = await recognizeWithBackend({ payload, apiBaseUrl });
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

  return recognizeWithBackend({ payload, apiBaseUrl });
}
