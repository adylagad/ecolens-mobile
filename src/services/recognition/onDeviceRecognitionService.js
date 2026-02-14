import { detectAndSummarize, isExecuTorchAvailable, warmup } from '../../native/ExecuTorchRecognizer';

let hasWarmupRun = false;

function parseTimeoutMs() {
  const raw = String(process.env?.EXPO_PUBLIC_ONDEVICE_TIMEOUT_MS ?? '').trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 12000;
  }
  return parsed;
}

async function withTimeout(promise, timeoutMs, message, code) {
  let timeoutId = null;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = new Error(message);
        timeoutError.code = code;
        reject(timeoutError);
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function readNumberEnv(name, fallback) {
  const raw = String(process.env?.[name] ?? '').trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRuntimeConfig() {
  const modelPath = String(process.env?.EXPO_PUBLIC_EXECUTORCH_MODEL_PATH ?? '').trim();
  const tokenizerPath = String(process.env?.EXPO_PUBLIC_EXECUTORCH_TOKENIZER_PATH ?? '').trim();
  const labelsPath = String(process.env?.EXPO_PUBLIC_EXECUTORCH_LABELS_PATH ?? '').trim();
  const preset = String(process.env?.EXPO_PUBLIC_EXECUTORCH_PRESET ?? 'balanced').trim() || 'balanced';

  const inputWidth = readNumberEnv('EXPO_PUBLIC_EXECUTORCH_INPUT_WIDTH', 224);
  const inputHeight = readNumberEnv('EXPO_PUBLIC_EXECUTORCH_INPUT_HEIGHT', 224);

  const config = {
    preset,
    inputWidth,
    inputHeight,
  };
  if (modelPath) {
    config.modelPath = modelPath;
  }
  if (tokenizerPath) {
    config.tokenizerPath = tokenizerPath;
  }
  if (labelsPath) {
    config.labelsPath = labelsPath;
  }
  return config;
}

export async function recognizeOnDevice({ payload }) {
  if (!isExecuTorchAvailable()) {
    const error = new Error('On-device ExecuTorch is not available in this build.');
    error.code = 'ON_DEVICE_UNAVAILABLE';
    throw error;
  }

  const runtimeConfig = buildRuntimeConfig();
  if (!hasWarmupRun) {
    try {
      await withTimeout(
        warmup(runtimeConfig),
        6000,
        'On-device warmup timed out.',
        'ON_DEVICE_WARMUP_TIMEOUT'
      );
      hasWarmupRun = true;
    } catch (warmupError) {
      // Continue to direct inference; native module also warms up per-request.
    }
  }

  const data = await withTimeout(
    detectAndSummarize({
      ...payload,
      runtimeConfig,
    }),
    parseTimeoutMs(),
    'On-device recognition timed out. Please try again.',
    'ON_DEVICE_TIMEOUT'
  );
  if (!data || typeof data !== 'object') {
    const error = new Error('On-device recognizer returned an invalid response payload.');
    error.code = 'ON_DEVICE_INVALID_RESPONSE';
    throw error;
  }

  return {
    data,
    runtime: {
      engine: 'on-device',
      source: 'ios-executorch',
      runtimeConfig,
    },
  };
}
