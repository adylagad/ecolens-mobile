# ExecuTorch iOS Integration Steps

This project now has a JS-level inference engine selector and service abstraction:

- `auto`: try on-device first (iOS), then fallback to backend
- `on-device`: require local native ExecuTorch module
- `backend`: current `/api/recognize` flow

## What is already implemented

- Native bridge stub:
  - `src/native/ExecuTorchRecognizer.js`
- iOS native module skeleton:
  - `ios/ecolensmobile/ExecuTorchRecognizer.m`
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
  confidence?: number
}) -> Promise<object>
```

3. The returned object should match current result usage in `CameraScreen`:

- `name`
- `category`
- `ecoScore`
- `co2Gram`
- `confidence`
- `suggestion` or `altRecommendation`
- `explanation`

4. Integrate ExecuTorch runtime + model files in iOS project, then use EAS/custom dev client for testing.
5. Replace stub response in `ios/ecolensmobile/ExecuTorchRecognizer.m` with real model output.

## Notes

- On-device mode currently throws a clear error until native module is linked.
- Auto mode is safe for demos because it falls back to backend automatically.
- This repo currently ignores `/ios` and `/android` in `.gitignore`; if you want native bridge code committed, remove those ignore entries.
