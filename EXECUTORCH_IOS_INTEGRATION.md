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
    labelsPath?: string,
    preset?: string
  }
}) -> Promise<object>
```

Also exposed for preloading:

```text
warmup(config: {
  modelPath?: string,
  tokenizerPath?: string,
  labelsPath?: string,
  preset?: string
}) -> Promise<{ ok: boolean }>
```

## Runtime adapter symbols required

`ExecuTorchRecognizer.mm` now calls a C-ABI adapter via `dlsym`. Link a native library that exports:

- `et_ecolens_create_model(const char* model_path, const char* tokenizer_path, const char* preset, const char** error_message)`
- `et_ecolens_run_inference(void* handle, const float* input, int64_t input_size, int32_t width, int32_t height, const char* label_hint, const char** error_message)`
- `et_ecolens_destroy_model(void* handle)`
- `et_ecolens_free_cstring(const char* ptr)` (optional but recommended)

Current implementation location:
- `ios/ecolensmobile/ETExecuTorchAdapter.mm` (exports all required symbols)
- This file now contains an ExecuTorch C++ inference path guarded by `ET_ENABLE_EXECUTORCH_CPP`.
- Default builds keep fallback heuristic inference enabled when ExecuTorch C++ headers/libs are not linked.
- The adapter now loads optional class metadata from JSON (labels/classes) and maps top model outputs into richer summaries.

To enable native ExecuTorch C++ path:
- Add preprocessor define `ET_ENABLE_EXECUTORCH_CPP=1` for the iOS target.
- Ensure ExecuTorch headers are available:
  - `executorch/extension/module/module.h`
  - `executorch/extension/tensor/tensor.h`
- Ensure ExecuTorch runtime libs are linked for iOS.
- Current setup intentionally uses fallback path on `iphonesimulator`:
  - ExecuTorch C++ path is compiled only for non-simulator builds.
  - `Podfile` post-install rewrites generated pods `.xcconfig` so device keeps full ExecuTorch linkage and simulator strips device-only archives.

The run function is expected to return a JSON string with fields such as:

- `name` or `label`
- `category`
- `ecoScore` (or `eco_score`)
- `co2Gram` (or `co2_gram`)
- `confidence`
- `summary` / `suggestion`
- `explanation`
- `topPredictions` (optional top-k classes with probability)

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
   - done for top-1/top-k parsing + label-map support; next is model-specific prompt/summary tuning.

## Notes

- On-device mode currently throws a clear error until native module is linked.
- Auto mode is safe for demos because it falls back to backend automatically.
- Confirmed low-confidence labels are now sent to backend training APIs (`/api/training/samples`) with:
  - captured image base64
  - predicted label/confidence
  - user-confirmed final label
  - inferred taxonomy leaf
- This repo currently ignores `/ios` and `/android` in `.gitignore`; if you want native bridge code committed, remove those ignore entries.
- JS runtime config is passed from env vars:
  - `EXPO_PUBLIC_EXECUTORCH_MODEL_PATH`
  - `EXPO_PUBLIC_EXECUTORCH_TOKENIZER_PATH`
  - `EXPO_PUBLIC_EXECUTORCH_LABELS_PATH`
  - `EXPO_PUBLIC_EXECUTORCH_PRESET`
  - `EXPO_PUBLIC_EXECUTORCH_INPUT_WIDTH`
  - `EXPO_PUBLIC_EXECUTORCH_INPUT_HEIGHT`
  - `EXPO_PUBLIC_ONDEVICE_FALLBACK_CONFIDENCE` (auto mode backend fallback threshold, default `0.45`)
- Runtime path behavior:
  - If `modelPath` / `labelsPath` is an existing file path, it is used directly.
  - If it is a bundle-style value (for example `model.pte`, `labels.json`, `models/my_model.pte`), native code resolves it from app bundle resources.
  - If unset, native code falls back to default bundled candidate names.
- Quick setup:
  1. Add `model.pte` and `labels.json` to iOS app bundle resources.
  2. Copy `.env.example` to `.env.local` and adjust values if needed.
  3. Rebuild iOS app (`npx expo run:ios`) so env vars are baked in.

## Training Dataset Pipeline

Backend endpoints added for MobileNet fine-tuning dataset creation:

- `GET /api/training/taxonomy` -> taxonomy JSON (current version includes 101 classes)
- `POST /api/training/samples` -> save user-confirmed labeled sample
- `GET /api/training/samples` -> inspect collected samples
- `GET /api/training/export` -> export train-ready sample manifest (optionally with images)

Example export call:

```bash
curl "http://<backend-host>:8080/api/training/export?limit=2000&confirmedOnly=true&includeImages=true"
```

End-to-end training scripts now live in backend repo:

- `/Users/aditya/repos/hacks/ecolens-backend/ml/export_training_data.py`
- `/Users/aditya/repos/hacks/ecolens-backend/ml/prepare_dataset.py`
- `/Users/aditya/repos/hacks/ecolens-backend/ml/train_and_export.py`
- `/Users/aditya/repos/hacks/ecolens-backend/ml/run_pipeline.py`

Quick run:

```bash
cd /Users/aditya/repos/hacks/ecolens-backend
python ml/run_pipeline.py \
  --api-base-url "https://<backend-host>" \
  --id-token "<GOOGLE_ID_TOKEN>" \
  --limit 8000 \
  --min-images-per-class 12 \
  --epochs 12
```

Then copy generated artifacts:

- `ml/artifacts/model/model.pte` -> `ios/ecolensmobile/model.pte`
- `ml/artifacts/model/labels.json` -> `ios/ecolensmobile/labels.json`
