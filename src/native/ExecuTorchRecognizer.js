import { NativeModules, Platform } from 'react-native';

const MODULE_NAME = 'ExecuTorchRecognizer';

function getNativeRecognizerModule() {
  return NativeModules?.[MODULE_NAME] ?? null;
}

export function isExecuTorchAvailable() {
  if (Platform.OS !== 'ios') {
    return false;
  }
  const module = getNativeRecognizerModule();
  return Boolean(module && typeof module.detectAndSummarize === 'function');
}

export async function detectAndSummarize(payload) {
  if (Platform.OS !== 'ios') {
    const error = new Error('On-device ExecuTorch inference is currently supported only on iOS.');
    error.code = 'ON_DEVICE_UNSUPPORTED_PLATFORM';
    throw error;
  }
  const module = getNativeRecognizerModule();
  if (!module || typeof module.detectAndSummarize !== 'function') {
    const error = new Error(
      'Native ExecuTorch module is not linked yet. Build with iOS native project + module integration.'
    );
    error.code = 'ON_DEVICE_UNAVAILABLE';
    throw error;
  }
  return module.detectAndSummarize(payload);
}
