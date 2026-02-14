import { detectAndSummarize, isExecuTorchAvailable } from '../../native/ExecuTorchRecognizer';

export async function recognizeOnDevice({ payload }) {
  if (!isExecuTorchAvailable()) {
    const error = new Error('On-device ExecuTorch is not available in this build.');
    error.code = 'ON_DEVICE_UNAVAILABLE';
    throw error;
  }

  const data = await detectAndSummarize(payload);
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
    },
  };
}
