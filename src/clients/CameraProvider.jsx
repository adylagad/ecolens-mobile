import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

const CameraProvider = forwardRef(function CameraProvider(_, ref) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useImperativeHandle(ref, () => ({
    async captureImage() {
      let granted = permission?.granted;

      if (!granted) {
        const nextPermission = await requestPermission();
        granted = nextPermission?.granted;
      }

      if (!granted) {
        throw new Error('Camera permission denied.');
      }

      if (!cameraRef.current?.takePictureAsync) {
        throw new Error('Camera is not ready yet.');
      }

      setIsCapturing(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: true,
          skipProcessing: true,
        });

        if (!photo?.base64) {
          throw new Error('Captured image did not include base64 data.');
        }

        return photo.base64;
      } finally {
        setTimeout(() => setIsCapturing(false), 120);
      }
    },
  }));

  if (!permission) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Camera permission is needed for auto-detect mode.</Text>
        <Pressable onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.previewWrapper}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      {isCapturing ? <View pointerEvents="none" style={styles.captureFlash} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  previewWrapper: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    opacity: 0.35,
  },
  placeholder: {
    width: '100%',
    minHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  placeholderText: {
    color: '#333',
    textAlign: 'center',
  },
  permissionButton: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f7a4d',
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default CameraProvider;
