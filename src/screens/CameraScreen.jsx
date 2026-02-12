import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
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

const THEMES = {
  dark: {
    page: '#07111F',
    card: '#0F172A',
    cardAlt: '#131F34',
    border: '#25324A',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    action: '#16A34A',
    actionText: '#F8FAFC',
    input: '#0A1425',
    modalBackdrop: 'rgba(2, 6, 23, 0.7)',
    modeActiveBg: '#0EA5E9',
    modeActiveText: '#082F49',
    modeText: '#E2E8F0',
    noticeInfoBg: '#0C4A6E',
    noticeInfoBorder: '#0369A1',
    noticeErrorBg: '#7F1D1D',
    noticeErrorBorder: '#B91C1C',
  },
  light: {
    page: '#F1F5F9',
    card: '#FFFFFF',
    cardAlt: '#F8FAFC',
    border: '#D1D5DB',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    action: '#16A34A',
    actionText: '#F8FAFC',
    input: '#FFFFFF',
    modalBackdrop: 'rgba(15, 23, 42, 0.35)',
    modeActiveBg: '#0EA5E9',
    modeActiveText: '#082F49',
    modeText: '#0F172A',
    noticeInfoBg: '#E0F2FE',
    noticeInfoBorder: '#7DD3FC',
    noticeErrorBg: '#FEE2E2',
    noticeErrorBorder: '#FCA5A5',
  },
};

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

function getConfidenceTone(confidence) {
  if (typeof confidence !== 'number') {
    return { bg: '#334155', text: '#E2E8F0', label: 'Unknown' };
  }
  if (confidence >= 0.8) {
    return { bg: '#14532D', text: '#DCFCE7', label: 'Confidence: High' };
  }
  if (confidence >= 0.6) {
    return { bg: '#78350F', text: '#FEF3C7', label: 'Confidence: Medium' };
  }
  return { bg: '#7F1D1D', text: '#FEE2E2', label: 'Confidence: Low' };
}

function buildScoreBreakdown(result) {
  if (!result) {
    return [];
  }

  const rows = [];
  const name = String(result.name ?? '').toLowerCase();
  const category = String(result.category ?? '').toLowerCase();
  const combined = `${name} ${category}`;
  const co2 = typeof result.co2Gram === 'number' ? result.co2Gram : null;
  const recyclability = String(result.recyclability ?? '').toLowerCase();

  if (combined.includes('reusable') || combined.includes('refillable')) {
    rows.push({ label: 'Reusable/refillable item', delta: '+18' });
  }
  if (combined.includes('single-use') || combined.includes('single use') || combined.includes('disposable')) {
    rows.push({ label: 'Single-use item pattern', delta: '-18' });
  }
  if (combined.includes('plastic')) {
    rows.push({ label: 'Plastic material impact', delta: '-10' });
  }
  if (combined.includes('cloth') || combined.includes('recycled')) {
    rows.push({ label: 'Lower-impact material', delta: '+10' });
  }

  if (recyclability.includes('high')) {
    rows.push({ label: 'High recyclability', delta: '+10' });
  } else if (recyclability.includes('medium')) {
    rows.push({ label: 'Medium recyclability', delta: '+3' });
  } else if (recyclability.includes('low') || recyclability.includes('unknown')) {
    rows.push({ label: 'Low recyclability', delta: '-8' });
  }

  if (co2 !== null) {
    if (co2 <= 20) {
      rows.push({ label: 'Very low CO2 footprint', delta: '+10' });
    } else if (co2 <= 50) {
      rows.push({ label: 'Low CO2 footprint', delta: '+7' });
    } else if (co2 <= 100) {
      rows.push({ label: 'Moderate CO2 footprint', delta: '+2' });
    } else if (co2 > 200) {
      rows.push({ label: 'High CO2 footprint', delta: '-10' });
    } else {
      rows.push({ label: 'Elevated CO2 footprint', delta: '-4' });
    }
  }

  if (!rows.length) {
    rows.push({ label: 'Baseline scoring applied', delta: '0' });
  }
  return rows;
}

export default function CameraScreen() {
  const cameraProviderRef = useRef(null);
  const resultAnim = useRef(new Animated.Value(0)).current;

  const [themeName, setThemeName] = useState('dark');
  const [apiMode, setApiMode] = useState('production');
  const [devBaseUrl, setDevBaseUrl] = useState(DEV_API_BASE_URL);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

  const palette = THEMES[themeName];
  const styles = useMemo(() => createStyles(palette), [palette]);
  const apiBaseUrl = apiMode === 'development' ? devBaseUrl : PROD_API_BASE_URL;
  const selectedLabelText =
    LABEL_OPTIONS.find((option) => option.value === selectedLabel)?.label || LABEL_OPTIONS[0].label;
  const manualLabelOptions = LABEL_OPTIONS.filter(
    (option) => option.value && option.value !== '__test_image__'
  );

  useEffect(() => {
    if (!result) {
      resultAnim.setValue(0);
      setIsBreakdownOpen(false);
      return;
    }

    Animated.timing(resultAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [result, resultAnim]);

  const loadDefaultImageBase64 = async () => TEST_IMAGE_BASE64;

  const handleAnalyze = async (manualOverrideLabel = null) => {
    setLoading(true);
    setError('');
    setMessage('');
    setResult(null);

    try {
      const payload = {
        detectedLabel: '',
        confidence: 0.9,
      };

      if (manualOverrideLabel) {
        payload.detectedLabel = manualOverrideLabel;
      } else if (selectedLabel === '__test_image__') {
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
  const confidenceTone = getConfidenceTone(result?.confidence);
  const showLowConfidenceHelp =
    typeof result?.confidence === 'number' && result.confidence < 0.6 && !loading;
  const suggestedConfirmLabels = useMemo(() => {
    if (!showLowConfidenceHelp || !result) {
      return manualLabelOptions.slice(0, 3);
    }
    const hintText = `${result.name ?? ''} ${result.category ?? ''}`.toLowerCase();
    const ranked = [...manualLabelOptions].sort((a, b) => {
      const aTokens = a.value.toLowerCase().split(' ');
      const bTokens = b.value.toLowerCase().split(' ');
      const aScore = aTokens.filter((token) => hintText.includes(token)).length;
      const bScore = bTokens.filter((token) => hintText.includes(token)).length;
      return bScore - aScore;
    });
    return ranked.slice(0, 3);
  }, [manualLabelOptions, result, showLowConfidenceHelp]);
  const scoreBreakdown = useMemo(() => buildScoreBreakdown(result), [result]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.eyebrow}>EcoLens</Text>
            <View style={styles.themeToggle}>
              <Pressable
                onPress={() => setThemeName('light')}
                style={[
                  styles.themeToggleButton,
                  themeName === 'light' ? styles.themeToggleButtonActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.themeToggleText,
                    themeName === 'light' ? styles.themeToggleTextActive : null,
                  ]}
                >
                  Light
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setThemeName('dark')}
                style={[
                  styles.themeToggleButton,
                  themeName === 'dark' ? styles.themeToggleButtonActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.themeToggleText,
                    themeName === 'dark' ? styles.themeToggleTextActive : null,
                  ]}
                >
                  Dark
                </Text>
              </Pressable>
            </View>
          </View>

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
                placeholderTextColor={palette.textSecondary}
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
          <Pressable onPress={() => setIsDropdownOpen(true)} style={styles.dropdownTrigger}>
            <Text style={styles.dropdownLabel}>{selectedLabelText}</Text>
            <Text style={styles.caret}>▼</Text>
          </Pressable>
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
            <ActivityIndicator color={palette.actionText} />
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
            <Text style={[styles.noticeText, themeName === 'light' ? styles.noticeTextLightError : null]}>
              {error}
            </Text>
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
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>{result.title || result.name || 'Result'}</Text>
              <View style={styles.badgeColumn}>
                <View style={[styles.scoreBadge, { backgroundColor: scoreTone.bg }]}>
                  <Text style={[styles.scoreBadgeText, { color: scoreTone.text }]}>
                    {scoreTone.label}
                  </Text>
                </View>
                <View style={[styles.scoreBadge, { backgroundColor: confidenceTone.bg }]}>
                  <Text style={[styles.scoreBadgeText, { color: confidenceTone.text }]}>
                    {confidenceTone.label}
                  </Text>
                </View>
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

            {showLowConfidenceHelp ? (
              <View style={styles.confirmBlock}>
                <Text style={styles.confirmTitle}>Low confidence. Confirm the item:</Text>
                <View style={styles.confirmChipRow}>
                  {suggestedConfirmLabels.map((option) => (
                    <Pressable
                      key={option.value}
                      style={styles.confirmChip}
                      onPress={() => {
                        setSelectedLabel(option.value);
                        handleAnalyze(option.value);
                      }}
                    >
                      <Text style={styles.confirmChipText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.breakdownCard}>
              <Pressable
                style={styles.breakdownHeader}
                onPress={() => setIsBreakdownOpen((prev) => !prev)}
              >
                <Text style={styles.breakdownTitle}>Why this score</Text>
                <Text style={styles.breakdownToggle}>{isBreakdownOpen ? 'Hide ▲' : 'Show ▼'}</Text>
              </Pressable>
              {isBreakdownOpen ? (
                <View style={styles.breakdownList}>
                  {scoreBreakdown.map((row, index) => (
                    <View key={`${row.label}-${index}`} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{row.label}</Text>
                      <Text
                        style={[
                          styles.breakdownDelta,
                          row.delta.startsWith('+')
                            ? styles.breakdownDeltaPositive
                            : row.delta.startsWith('-')
                              ? styles.breakdownDeltaNegative
                              : styles.breakdownDeltaNeutral,
                        ]}
                      >
                        {row.delta}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isDropdownOpen}
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsDropdownOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Label Mode</Text>
              <Pressable onPress={() => setIsDropdownOpen(false)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>
            {LABEL_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => {
                  setSelectedLabel(option.value);
                  setIsDropdownOpen(false);
                }}
                style={[
                  styles.modalOption,
                  selectedLabel === option.value ? styles.modalOptionActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    selectedLabel === option.value ? styles.modalOptionTextActive : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(palette) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.page,
    },
    container: {
      padding: 16,
      gap: 14,
      paddingBottom: 28,
    },
    heroCard: {
      backgroundColor: palette.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
      gap: 6,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    eyebrow: {
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: '#38BDF8',
      fontWeight: '700',
    },
    themeToggle: {
      flexDirection: 'row',
      gap: 6,
      backgroundColor: palette.input,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 999,
      padding: 3,
    },
    themeToggleButton: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    themeToggleButtonActive: {
      backgroundColor: '#0EA5E9',
    },
    themeToggleText: {
      color: palette.textSecondary,
      fontWeight: '700',
      fontSize: 12,
    },
    themeToggleTextActive: {
      color: '#082F49',
    },
    title: {
      fontSize: 26,
      color: palette.textPrimary,
      fontWeight: '800',
    },
    subtitle: {
      color: palette.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    sectionCard: {
      backgroundColor: palette.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    sectionTitle: {
      color: palette.textPrimary,
      fontSize: 18,
      fontWeight: '700',
    },
    sectionHint: {
      color: palette.textSecondary,
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
      borderColor: palette.border,
      backgroundColor: palette.input,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeButtonActive: {
      backgroundColor: palette.modeActiveBg,
      borderColor: palette.modeActiveBg,
    },
    modeButtonText: {
      color: palette.modeText,
      fontWeight: '700',
    },
    modeButtonTextActive: {
      color: palette.modeActiveText,
    },
    devUrlBlock: {
      gap: 6,
    },
    fieldLabel: {
      color: palette.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    urlInput: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      backgroundColor: palette.input,
      paddingHorizontal: 12,
      color: palette.textPrimary,
    },
    endpointText: {
      fontSize: 12,
      color: palette.textSecondary,
    },
    cameraFrame: {
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
    },
    dropdownTrigger: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      backgroundColor: palette.input,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dropdownLabel: {
      color: palette.textPrimary,
      fontSize: 14,
      flex: 1,
      marginRight: 8,
    },
    caret: {
      color: palette.textSecondary,
      fontWeight: '700',
    },
    analyzeButton: {
      minHeight: 56,
      backgroundColor: palette.action,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: palette.action,
      shadowOpacity: 0.35,
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
      color: palette.actionText,
      fontSize: 18,
      fontWeight: '800',
    },
    noticeCard: {
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
    },
    infoCard: {
      backgroundColor: palette.noticeInfoBg,
      borderColor: palette.noticeInfoBorder,
    },
    errorCard: {
      backgroundColor: palette.noticeErrorBg,
      borderColor: palette.noticeErrorBorder,
    },
    noticeText: {
      color: palette.textPrimary,
      fontSize: 13,
      lineHeight: 18,
    },
    noticeTextLightError: {
      color: '#7F1D1D',
    },
    resultCard: {
      backgroundColor: palette.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    resultTitle: {
      flex: 1,
      fontSize: 20,
      fontWeight: '800',
      color: palette.textPrimary,
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
    badgeColumn: {
      alignItems: 'flex-end',
      gap: 6,
    },
    metricRow: {
      flexDirection: 'row',
      gap: 10,
    },
    metricItem: {
      flex: 1,
      backgroundColor: palette.cardAlt,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 10,
      gap: 2,
    },
    metricLabel: {
      color: palette.textSecondary,
      fontSize: 12,
    },
    metricValue: {
      color: palette.textPrimary,
      fontSize: 18,
      fontWeight: '700',
    },
    resultLine: {
      color: palette.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    resultLineLabel: {
      color: palette.textPrimary,
      fontWeight: '700',
    },
    resultFootnote: {
      color: palette.textSecondary,
      fontSize: 12,
    },
    confirmBlock: {
      backgroundColor: palette.cardAlt,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      padding: 10,
      gap: 8,
    },
    confirmTitle: {
      color: palette.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    confirmChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    confirmChip: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.input,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    confirmChipText: {
      color: palette.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    breakdownCard: {
      backgroundColor: palette.cardAlt,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      padding: 10,
      gap: 8,
    },
    breakdownHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    breakdownTitle: {
      color: palette.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    breakdownToggle: {
      color: palette.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    breakdownList: {
      gap: 6,
    },
    breakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    breakdownLabel: {
      flex: 1,
      color: palette.textSecondary,
      fontSize: 12,
    },
    breakdownDelta: {
      fontSize: 12,
      fontWeight: '800',
      minWidth: 26,
      textAlign: 'right',
    },
    breakdownDeltaPositive: {
      color: '#22C55E',
    },
    breakdownDeltaNegative: {
      color: '#EF4444',
    },
    breakdownDeltaNeutral: {
      color: palette.textSecondary,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: palette.modalBackdrop,
      justifyContent: 'flex-end',
      padding: 16,
    },
    modalSheet: {
      backgroundColor: palette.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 12,
      gap: 6,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    modalTitle: {
      color: palette.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    modalCloseButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.input,
    },
    modalCloseText: {
      color: palette.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    modalOption: {
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.input,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    modalOptionActive: {
      borderColor: '#0EA5E9',
      backgroundColor: '#0EA5E9',
    },
    modalOptionText: {
      color: palette.textPrimary,
      fontWeight: '600',
    },
    modalOptionTextActive: {
      color: '#082F49',
      fontWeight: '800',
    },
  });
}
