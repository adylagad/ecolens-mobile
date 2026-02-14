# ExecuTorch iOS Integration Steps

This project now has a JS-level inference engine selector and service abstraction:

- `auto`: try on-device first (iOS), then fallback to backend
- `on-device`: require local native ExecuTorch module
- `backend`: current `/api/recognize` flow

## What is already implemented

- Native bridge stub:
  - `src/native/ExecuTorchRecognizer.js`
- iOS native module skeleton:
  - `ios/ecolensmobile/ExecuTorchRecognizer.mm`
  - wired in `ios/ecolensmobile.xcodeproj/project.pbxproj`
- Recognition service layer:
  - `src/services/recognition/backendRecognitionService.js`
  - `src/services/recognition/onDeviceRecognitionService.js`
  - `src/services/recognition/recognitionService.js`
- Scan screen integration:
  - `src/screens/CameraScreen.jsx`

## Next step (native iOS module)

1. Generate native project:

```bash
npx expo prebuild --platform ios
```

2. Add native iOS module named `ExecuTorchRecognizer` with method:

```text
detectAndSummarize(payload: {
  imageBase64?: string,
  detectedLabel?: string,
  confidence?: number,
  runtimeConfig?: {
    modelPath?: string,
    tokenizerPath?: string,
    preset?: string
  }
}) -> Promise<object>
```

Also exposed for preloading:

```text
warmup(config: {
  modelPath?: string,
  tokenizerPath?: string,
  preset?: string
}) -> Promise<{ ok: boolean }>
```

## Runtime adapter symbols required

`ExecuTorchRecognizer.mm` now calls a C-ABI adapter via `dlsym`. Link a native library that exports:

- `et_ecolens_create_model(const char* model_path, const char* tokenizer_path, const char* preset, const char** error_message)`
- `et_ecolens_run_inference(void* handle, const float* input, int64_t input_size, int32_t width, int32_t height, const char* label_hint, const char** error_message)`
- `et_ecolens_destroy_model(void* handle)`
- `et_ecolens_free_cstring(const char* ptr)` (optional but recommended)

The run function is expected to return a JSON string with fields such as:

- `name` or `label`
- `category`
- `ecoScore` (or `eco_score`)
- `co2Gram` (or `co2_gram`)
- `confidence`
- `summary` / `suggestion`
- `explanation`

3. The returned object should match current result usage in `CameraScreen`:

- `name`
- `category`
- `ecoScore`
- `co2Gram`
- `confidence`
- `suggestion` or `altRecommendation`
- `explanation`

4. Integrate ExecuTorch runtime + model files in iOS project, then use EAS/custom dev client for testing.
5. Replace scaffold inference in `ios/ecolensmobile/ExecuTorchRecognizer.mm` with real model output.

## Notes

- On-device mode currently throws a clear error until native module is linked.
- Auto mode is safe for demos because it falls back to backend automatically.
- This repo currently ignores `/ios` and `/android` in `.gitignore`; if you want native bridge code committed, remove those ignore entries.
- JS runtime config is passed from env vars:
  - `EXPO_PUBLIC_EXECUTORCH_MODEL_PATH`
  - `EXPO_PUBLIC_EXECUTORCH_TOKENIZER_PATH`
  - `EXPO_PUBLIC_EXECUTORCH_PRESET`
  - `EXPO_PUBLIC_EXECUTORCH_INPUT_WIDTH`
  - `EXPO_PUBLIC_EXECUTORCH_INPUT_HEIGHT`
