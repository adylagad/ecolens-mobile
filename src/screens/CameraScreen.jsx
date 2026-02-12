import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import CameraProvider from '../clients/CameraProvider';
import { DEV_API_BASE_URL, PROD_API_BASE_URL } from '../config';

const LABEL_OPTIONS = [
  { label: 'Auto-detect from camera', value: '' },
  { label: 'Single-use Plastic Bottle', value: 'Single-use Plastic Bottle' },
  { label: 'Paper Coffee Cup', value: 'Paper Coffee Cup' },
  { label: 'LED Light Bulb', value: 'LED Light Bulb' },
];

export default function CameraScreen() {
  const cameraProviderRef = useRef(null);
  const [apiMode, setApiMode] = useState('production');
  const [devBaseUrl, setDevBaseUrl] = useState(DEV_API_BASE_URL);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const apiBaseUrl = apiMode === 'development' ? devBaseUrl : PROD_API_BASE_URL;

  const loadDefaultImageBase64 = async () => {
    const testAsset = Asset.fromModule(require('../../assets/test-image.png'));
    if (!testAsset.localUri) {
      await testAsset.downloadAsync();
    }

    const assetUri = testAsset.localUri || testAsset.uri;
    const normalizedUri =
      Platform.OS === 'ios' && assetUri.startsWith('file://')
        ? assetUri.replace('file://', '')
        : assetUri;

    const imageBase64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!imageBase64) {
      throw new Error('Default test image could not be loaded.');
    }

    return imageBase64;
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    setResult(null);

    try {
      const payload = {
        detectedLabel: selectedLabel,
        confidence: 0.9,
      };

      if (!selectedLabel) {
        try {
          const imageBase64 = await cameraProviderRef.current?.captureImage();
          if (!imageBase64) {
            throw new Error('No image was captured.');
          }
          payload.imageBase64 = imageBase64;
        } catch (captureError) {
          try {
            const imageBase64 = await loadDefaultImageBase64();
            payload.detectedLabel = '';
            payload.imageBase64 = imageBase64;
            setMessage(
              `Camera capture unavailable (${captureError.message}). Using bundled test image instead.`
            );
          } catch (defaultImageError) {
            const fallbackLabel = LABEL_OPTIONS[1].value;
            payload.detectedLabel = fallbackLabel;
            setSelectedLabel(fallbackLabel);
            setMessage(
              `Camera unavailable and test image failed (${defaultImageError.message}). Falling back to manual label.`
            );
          }
        }
      }

      const response = await fetch(`${apiBaseUrl}/api/recognize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (parseError) {
        data = null;
      }

      if (!response.ok) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }
      setResult(data);
    } catch (fetchError) {
      setError(
        fetchError.message
          ? `Could not analyze right now: ${fetchError.message}`
          : 'Could not analyze right now. Please check app and backend logs.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Camera + Label Demo</Text>

        <Text style={styles.label}>API environment</Text>
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setApiMode('development')}
            style={[
              styles.modeButton,
              apiMode === 'development' ? styles.modeButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.modeButtonText,
                apiMode === 'development' ? styles.modeButtonTextActive : null,
              ]}
            >
              Dev
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setApiMode('production')}
            style={[
              styles.modeButton,
              apiMode === 'production' ? styles.modeButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.modeButtonText,
                apiMode === 'production' ? styles.modeButtonTextActive : null,
              ]}
            >
              Production
            </Text>
          </Pressable>
        </View>

        {apiMode === 'development' ? (
          <View style={styles.devUrlBlock}>
            <Text style={styles.label}>Dev base URL</Text>
            <TextInput
              value={devBaseUrl}
              onChangeText={setDevBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.urlInput}
              placeholder="http://192.168.x.x:8080"
            />
          </View>
        ) : null}
        <Text style={styles.endpointText}>Using: {apiBaseUrl}</Text>

        <CameraProvider ref={cameraProviderRef} />

        <Text style={styles.label}>Manual label (optional)</Text>
        <Pressable
          onPress={() => setIsDropdownOpen((prev) => !prev)}
          style={styles.dropdownTrigger}
        >
          <Text>
            {LABEL_OPTIONS.find((option) => option.value === selectedLabel)?.label ||
              LABEL_OPTIONS[0].label}
          </Text>
          <Text style={styles.caret}>{isDropdownOpen ? '▲' : '▼'}</Text>
        </Pressable>

        {isDropdownOpen ? (
          <View style={styles.dropdownList}>
            {LABEL_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => {
                  setSelectedLabel(option.value);
                  setIsDropdownOpen(false);
                }}
                style={styles.dropdownItem}
              >
                <Text>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={handleAnalyze}
          disabled={loading}
          style={({ pressed }) => [
            styles.analyzeButton,
            pressed && !loading ? styles.analyzeButtonPressed : null,
            loading ? styles.analyzeButtonDisabled : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.analyzeButtonText}>Analyze</Text>
          )}
        </Pressable>

        {message ? <Text style={styles.messageText}>{message}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {result ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{result.title || result.name || 'Result'}</Text>
            <Text style={styles.resultItem}>ecoScore: {String(result.ecoScore ?? '-')}</Text>
            <Text style={styles.resultItem}>co2Gram: {String(result.co2Gram ?? '-')}</Text>
            <Text style={styles.resultItem}>
              suggestion: {String(result.suggestion ?? result.altRecommendation ?? '-')}
            </Text>
            <Text style={styles.resultItem}>
              explanation: {String(result.explanation ?? '-')}
            </Text>
            <Text style={styles.resultItem}>
              confidence: {String(result.confidence ?? '-')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  label: {
    fontSize: 14,
    color: '#444',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#1f7a4d',
    borderColor: '#1f7a4d',
  },
  modeButtonText: {
    color: '#222',
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  devUrlBlock: {
    gap: 6,
  },
  urlInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  endpointText: {
    fontSize: 12,
    color: '#666',
  },
  dropdownTrigger: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caret: {
    color: '#666',
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  dropdownItem: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  analyzeButton: {
    minHeight: 56,
    backgroundColor: '#1f7a4d',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeButtonPressed: {
    opacity: 0.9,
  },
  analyzeButtonDisabled: {
    opacity: 0.75,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  errorText: {
    color: '#b00020',
  },
  messageText: {
    color: '#2a5f3b',
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 6,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  resultItem: {
    fontSize: 14,
    color: '#222',
  },
});
