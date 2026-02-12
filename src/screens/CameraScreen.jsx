import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import CameraProvider from '../clients/CameraProvider';
import { DEV_API_BASE_URL, PROD_API_BASE_URL } from '../config';
import { TEST_IMAGE_BASE64 } from '../config/testImageBase64';

const LABEL_OPTIONS = [
  { label: 'Auto-detect from camera', value: '' },
  { label: 'Use bundled test image', value: '__test_image__' },
  { label: 'Single-use Plastic Bottle', value: 'Single-use Plastic Bottle' },
  { label: 'Paper Coffee Cup', value: 'Paper Coffee Cup' },
  { label: 'LED Light Bulb', value: 'LED Light Bulb' },
];

function getScoreTone(score) {
  if (typeof score !== 'number') {
    return { bg: '#334155', text: '#E2E8F0', label: 'N/A' };
  }
  if (score >= 85) {
    return { bg: '#14532D', text: '#DCFCE7', label: 'Excellent' };
  }
  if (score >= 60) {
    return { bg: '#365314', text: '#ECFCCB', label: 'Good' };
  }
  if (score >= 40) {
    return { bg: '#78350F', text: '#FEF3C7', label: 'Fair' };
  }
  return { bg: '#7F1D1D', text: '#FEE2E2', label: 'High Impact' };
}

export default function CameraScreen() {
  const cameraProviderRef = useRef(null);
  const resultAnim = useRef(new Animated.Value(0)).current;

  const [apiMode, setApiMode] = useState('production');
  const [devBaseUrl, setDevBaseUrl] = useState(DEV_API_BASE_URL);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);

  const apiBaseUrl = apiMode === 'development' ? devBaseUrl : PROD_API_BASE_URL;
  const selectedLabelText =
    LABEL_OPTIONS.find((option) => option.value === selectedLabel)?.label || LABEL_OPTIONS[0].label;

  useEffect(() => {
    if (!result) {
      resultAnim.setValue(0);
      return;
    }

    Animated.timing(resultAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [result, resultAnim]);

  const loadDefaultImageBase64 = async () => TEST_IMAGE_BASE64;

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    setResult(null);

    try {
      const payload = {
        detectedLabel: '',
        confidence: 0.9,
      };

      if (selectedLabel === '__test_image__') {
        const imageBase64 = await loadDefaultImageBase64();
        payload.detectedLabel = '';
        payload.imageBase64 = imageBase64;
      } else if (!selectedLabel) {
        try {
          const imageBase64 = await cameraProviderRef.current?.captureImage();
          if (!imageBase64) {
            throw new Error('No image was captured.');
          }
          payload.imageBase64 = imageBase64;
        } catch (captureError) {
          const imageBase64 = await loadDefaultImageBase64();
          payload.imageBase64 = imageBase64;
          setMessage(
            `Camera capture unavailable (${captureError.message}). Using bundled test image instead.`
          );
        }
      } else {
        payload.detectedLabel = selectedLabel;
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

  const scoreTone = getScoreTone(result?.ecoScore);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.backgroundOrbTop} />
      <View pointerEvents="none" style={styles.backgroundOrbBottom} />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>EcoLens</Text>
          <Text style={styles.title}>Scan. Understand. Improve.</Text>
          <Text style={styles.subtitle}>
            Detect everyday products and get a practical eco rating with better alternatives.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Connection</Text>
          <Text style={styles.sectionHint}>Pick API target before running analysis.</Text>

          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setApiMode('development')}
              style={[styles.modeButton, apiMode === 'development' ? styles.modeButtonActive : null]}
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
              style={[styles.modeButton, apiMode === 'production' ? styles.modeButtonActive : null]}
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
              <Text style={styles.fieldLabel}>Dev base URL</Text>
              <TextInput
                value={devBaseUrl}
                onChangeText={setDevBaseUrl}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.urlInput}
                placeholder="http://192.168.x.x:8080"
                placeholderTextColor="#94A3B8"
              />
            </View>
          ) : null}

          <Text style={styles.endpointText}>Active endpoint: {apiBaseUrl}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Input Source</Text>
          <Text style={styles.sectionHint}>Use camera auto-detect or set a manual label.</Text>

          <View style={styles.cameraFrame}>
            <CameraProvider ref={cameraProviderRef} />
          </View>

          <Text style={styles.fieldLabel}>Label mode</Text>
          <Pressable
            onPress={() => setIsDropdownOpen((prev) => !prev)}
            style={styles.dropdownTrigger}
          >
            <Text style={styles.dropdownLabel}>{selectedLabelText}</Text>
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
                  <Text style={styles.dropdownItemText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

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
            <ActivityIndicator color="#F8FAFC" />
          ) : (
            <Text style={styles.analyzeButtonText}>Analyze Item</Text>
          )}
        </Pressable>

        {message ? (
          <View style={[styles.noticeCard, styles.infoCard]}>
            <Text style={styles.noticeText}>{message}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.noticeCard, styles.errorCard]}>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        {result ? (
          <Animated.View
            style={[
              styles.resultCard,
              {
                opacity: resultAnim,
                transform: [
                  {
                    translateY: resultAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>{result.title || result.name || 'Result'}</Text>
              <View style={[styles.scoreBadge, { backgroundColor: scoreTone.bg }]}> 
                <Text style={[styles.scoreBadgeText, { color: scoreTone.text }]}> 
                  {scoreTone.label}
                </Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Eco Score</Text>
                <Text style={styles.metricValue}>{String(result.ecoScore ?? '-')}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>CO2 (g)</Text>
                <Text style={styles.metricValue}>{String(result.co2Gram ?? '-')}</Text>
              </View>
            </View>

            <Text style={styles.resultLine}>
              <Text style={styles.resultLineLabel}>Alternative: </Text>
              {String(result.suggestion ?? result.altRecommendation ?? '-')}
            </Text>
            <Text style={styles.resultLine}>
              <Text style={styles.resultLineLabel}>Explanation: </Text>
              {String(result.explanation ?? '-')}
            </Text>
            <Text style={styles.resultFootnote}>Confidence: {String(result.confidence ?? '-')}</Text>
          </Animated.View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#060C17',
  },
  backgroundOrbTop: {
    position: 'absolute',
    top: -100,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#1D4ED8',
    opacity: 0.2,
  },
  backgroundOrbBottom: {
    position: 'absolute',
    bottom: -110,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#059669',
    opacity: 0.15,
  },
  container: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: '#93C5FD',
    marginBottom: 6,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    color: '#F8FAFC',
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#0B1221',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  sectionTitle: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionHint: {
    color: '#94A3B8',
    fontSize: 13,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#0EA5E9',
    borderColor: '#0EA5E9',
  },
  modeButtonText: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#082F49',
  },
  devUrlBlock: {
    gap: 6,
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  urlInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    color: '#F1F5F9',
  },
  endpointText: {
    fontSize: 12,
    color: '#64748B',
  },
  cameraFrame: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dropdownTrigger: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownLabel: {
    color: '#F1F5F9',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  caret: {
    color: '#94A3B8',
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  dropdownItem: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  dropdownItemText: {
    color: '#E2E8F0',
  },
  analyzeButton: {
    minHeight: 56,
    backgroundColor: '#16A34A',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  analyzeButtonPressed: {
    opacity: 0.92,
  },
  analyzeButtonDisabled: {
    opacity: 0.75,
  },
  analyzeButtonText: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  noticeCard: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  infoCard: {
    backgroundColor: '#0C4A6E',
    borderColor: '#0369A1',
  },
  errorCard: {
    backgroundColor: '#7F1D1D',
    borderColor: '#B91C1C',
  },
  noticeText: {
    color: '#F8FAFC',
    fontSize: 13,
    lineHeight: 18,
  },
  resultCard: {
    backgroundColor: '#0B1221',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  resultTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  scoreBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
    gap: 2,
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  metricValue: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '700',
  },
  resultLine: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
  },
  resultLineLabel: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  resultFootnote: {
    color: '#94A3B8',
    fontSize: 12,
  },
});
