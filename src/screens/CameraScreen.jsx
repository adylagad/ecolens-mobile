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

const GOAL_TARGET = 5;
const LOADING_STAGES = ['Uploading', 'Detecting', 'Scoring'];

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function isSingleUseResult(result) {
  if (!result) {
    return false;
  }
  const combined = `${String(result.name ?? '')} ${String(result.category ?? '')}`.toLowerCase();
  return (
    combined.includes('single-use') ||
    combined.includes('single use') ||
    combined.includes('disposable') ||
    combined.includes('plastic bag') ||
    combined.includes('plastic straw') ||
    combined.includes('paper cup')
  );
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

function getAlternativeSuggestions(result) {
  if (!result) {
    return [];
  }
  const category = String(result.category ?? '').toLowerCase();
  const name = String(result.name ?? '').toLowerCase();
  const combined = `${category} ${name}`;

  if (combined.includes('plastic bottle')) {
    return ['Reusable Bottle', 'Glass Bottle', 'Insulated Reusable Bottle'];
  }
  if (combined.includes('paper cup') || combined.includes('coffee cup')) {
    return ['Refillable Coffee Cup', 'Stainless Steel Tumbler', 'Bring-your-own mug'];
  }
  if (combined.includes('bag')) {
    return ['Cloth Bag', 'Jute Shopping Bag', 'Reuse old tote'];
  }
  if (combined.includes('utensil') || combined.includes('cutlery') || combined.includes('straw')) {
    return ['Reusable Cutlery Set', 'Reusable Metal Straw', 'Carry travel utensils'];
  }
  if (combined.includes('food packaging') || combined.includes('container')) {
    return ['Glass Lunch Container', 'Reusable steel lunchbox', 'Choose dine-in packaging'];
  }

  const fallback = String(result.altRecommendation ?? '').trim();
  return fallback ? [fallback] : ['Choose reusable and refillable alternatives'];
}

function getGreenerAlternativeLabel(result) {
  if (!result) {
    return null;
  }
  const category = String(result.category ?? '').toLowerCase();
  const name = String(result.name ?? '').toLowerCase();
  const combined = `${category} ${name}`;

  if (combined.includes('plastic bottle')) {
    return 'Reusable Bottle';
  }
  if (combined.includes('paper cup') || combined.includes('coffee cup')) {
    return 'Refillable Coffee Cup';
  }
  if (combined.includes('plastic bag')) {
    return 'Cloth Bag';
  }
  if (combined.includes('disposable') || combined.includes('single-use') || combined.includes('single use')) {
    return 'Reusable Cutlery Set';
  }

  return null;
}

export default function CameraScreen() {
  const cameraProviderRef = useRef(null);
  const scrollViewRef = useRef(null);
  const resultCardYRef = useRef(0);
  const resultAnim = useRef(new Animated.Value(0)).current;

  const [themeName, setThemeName] = useState('dark');
  const [apiMode, setApiMode] = useState('production');
  const [devBaseUrl, setDevBaseUrl] = useState(DEV_API_BASE_URL);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [highImpactOnly, setHighImpactOnly] = useState(false);
  const [goalState, setGoalState] = useState({
    weekKey: getWeekKey(),
    avoidedSingleUseCount: 0,
    currentStreak: 0,
    bestStreak: 0,
  });

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

    const timer = setTimeout(() => {
      const targetY = Math.max(resultCardYRef.current - 10, 0);
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
    }, 180);

    return () => clearTimeout(timer);
  }, [result, resultAnim]);

  useEffect(() => {
    if (!loading) {
      setLoadingStageIndex(0);
      return undefined;
    }
    const interval = setInterval(() => {
      setLoadingStageIndex((prev) => (prev + 1) % LOADING_STAGES.length);
    }, 900);
    return () => clearInterval(interval);
  }, [loading]);

  const loadingStage = LOADING_STAGES[loadingStageIndex];

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
      const singleUse = isSingleUseResult(data);
      setGoalState((prev) => {
        const currentWeek = getWeekKey();
        const base =
          prev.weekKey === currentWeek
            ? prev
            : { weekKey: currentWeek, avoidedSingleUseCount: 0, currentStreak: prev.currentStreak, bestStreak: prev.bestStreak };
        const nextStreak = singleUse ? 0 : base.currentStreak + 1;
        const nextBest = Math.max(base.bestStreak, nextStreak);
        return {
          weekKey: currentWeek,
          avoidedSingleUseCount: singleUse
            ? base.avoidedSingleUseCount
            : Math.min(base.avoidedSingleUseCount + 1, GOAL_TARGET),
          currentStreak: nextStreak,
          bestStreak: nextBest,
        };
      });
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
  const alternativeSuggestions = useMemo(() => getAlternativeSuggestions(result), [result]);
  const greenerLabel = useMemo(() => getGreenerAlternativeLabel(result), [result]);
  const visibleHistory = useMemo(
    () => (highImpactOnly ? scanHistory.filter((entry) => entry.ecoScore < 40) : scanHistory),
    [highImpactOnly, scanHistory]
  );
  const improvementStats = useMemo(() => {
    if (!scanHistory.length) {
      return { avgScore: null, highImpactCount: 0, greenerCount: 0 };
    }
    const avgScore =
      scanHistory.reduce((sum, entry) => sum + (typeof entry.ecoScore === 'number' ? entry.ecoScore : 0), 0) /
      scanHistory.length;
    const highImpactCount = scanHistory.filter((entry) => entry.ecoScore < 40).length;
    const greenerCount = scanHistory.filter((entry) => entry.ecoScore >= 85).length;
    return { avgScore, highImpactCount, greenerCount };
  }, [scanHistory]);
  const goalProgress = Math.min(goalState.avoidedSingleUseCount / GOAL_TARGET, 1);

  const handleScanAgain = () => {
    setResult(null);
    setMessage('');
    setError('');
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 50);
  };

  const handleSaveResult = () => {
    if (!result) {
      return;
    }
    const entry = {
      id: `${Date.now()}`,
      item: String(result.name ?? 'Unknown item'),
      category: String(result.category ?? '-'),
      ecoScore: typeof result.ecoScore === 'number' ? result.ecoScore : Number(result.ecoScore ?? 0),
      confidence: typeof result.confidence === 'number' ? result.confidence : Number(result.confidence ?? 0),
      timestamp: new Date().toISOString(),
    };
    setScanHistory((prev) => [entry, ...prev].slice(0, 40));
    setMessage('Saved to local scan history.');
  };

  const handleTryGreenerAlternative = () => {
    if (!greenerLabel) {
      setMessage('No mapped greener alternative yet for this item.');
      return;
    }
    setSelectedLabel(greenerLabel);
    handleAnalyze(greenerLabel);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
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
          <View style={styles.goalHeaderRow}>
            <Text style={styles.sectionTitle}>Weekly Goal</Text>
            <Text style={styles.goalWeekText}>{goalState.weekKey}</Text>
          </View>
          <Text style={styles.sectionHint}>Avoid 5 single-use items this week.</Text>
          <View style={styles.goalProgressTrack}>
            <View style={[styles.goalProgressFill, { width: `${goalProgress * 100}%` }]} />
          </View>
          <View style={styles.goalStatsRow}>
            <Text style={styles.goalStatText}>
              Progress: {goalState.avoidedSingleUseCount}/{GOAL_TARGET}
            </Text>
            <Text style={styles.goalStatText}>Streak: {goalState.currentStreak}</Text>
            <Text style={styles.goalStatText}>Best: {goalState.bestStreak}</Text>
          </View>
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
          onPress={() => handleAnalyze()}
          disabled={loading}
          style={({ pressed }) => [
            styles.analyzeButton,
            pressed && !loading ? styles.analyzeButtonPressed : null,
            loading ? styles.analyzeButtonDisabled : null,
          ]}
        >
          {loading ? (
            <View style={styles.loadingButtonContent}>
              <ActivityIndicator color={palette.actionText} />
              <Text style={styles.loadingButtonText}>{loadingStage}</Text>
            </View>
          ) : (
            <Text style={styles.analyzeButtonText}>Analyze Item</Text>
          )}
        </Pressable>

        {loading ? (
          <View style={styles.skeletonCard}>
            <Text style={styles.skeletonTitle}>Processing: {loadingStage}</Text>
            <View style={styles.skeletonLineLg} />
            <View style={styles.skeletonRow}>
              <View style={styles.skeletonMetric} />
              <View style={styles.skeletonMetric} />
            </View>
            <View style={styles.skeletonLineMd} />
            <View style={styles.skeletonLineSm} />
          </View>
        ) : null}

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
            onLayout={(event) => {
              resultCardYRef.current = event.nativeEvent.layout.y;
            }}
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

            <View style={styles.quickActionRow}>
              <Pressable style={styles.secondaryActionButton} onPress={handleTryGreenerAlternative}>
                <Text style={styles.secondaryActionText}>Try greener alternative</Text>
              </Pressable>
              <Pressable style={styles.secondaryActionButton} onPress={handleScanAgain}>
                <Text style={styles.secondaryActionText}>Scan again</Text>
              </Pressable>
              <Pressable style={styles.secondaryActionButton} onPress={handleSaveResult}>
                <Text style={styles.secondaryActionText}>Save</Text>
              </Pressable>
            </View>

            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownTitle}>What should I buy instead?</Text>
              <View style={styles.confirmChipRow}>
                {alternativeSuggestions.map((suggestion) => (
                  <View key={suggestion} style={styles.suggestionChip}>
                    <Text style={styles.suggestionChipText}>{suggestion}</Text>
                  </View>
                ))}
              </View>
            </View>

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

        <View style={styles.sectionCard}>
          <View style={styles.historyHeaderRow}>
            <Text style={styles.sectionTitle}>History Timeline</Text>
            <Pressable
              style={[styles.filterPill, highImpactOnly ? styles.filterPillActive : null]}
              onPress={() => setHighImpactOnly((prev) => !prev)}
            >
              <Text style={[styles.filterPillText, highImpactOnly ? styles.filterPillTextActive : null]}>
                {highImpactOnly ? 'High impact only: ON' : 'High impact only: OFF'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.sectionHint}>Track scans and monitor progress over time.</Text>

          <View style={styles.historyStatsRow}>
            <View style={styles.historyStatCard}>
              <Text style={styles.historyStatLabel}>Avg score</Text>
              <Text style={styles.historyStatValue}>
                {improvementStats.avgScore === null ? '-' : improvementStats.avgScore.toFixed(1)}
              </Text>
            </View>
            <View style={styles.historyStatCard}>
              <Text style={styles.historyStatLabel}>High impact</Text>
              <Text style={styles.historyStatValue}>{improvementStats.highImpactCount}</Text>
            </View>
            <View style={styles.historyStatCard}>
              <Text style={styles.historyStatLabel}>Greener picks</Text>
              <Text style={styles.historyStatValue}>{improvementStats.greenerCount}</Text>
            </View>
          </View>

          {!visibleHistory.length ? (
            <Text style={styles.historyEmpty}>No saved scans yet. Analyze and tap Save.</Text>
          ) : (
            <View style={styles.historyList}>
              {visibleHistory.map((entry) => (
                <View key={entry.id} style={styles.historyItem}>
                  <View style={styles.historyItemTop}>
                    <Text style={styles.historyItemTitle}>{entry.item}</Text>
                    <Text style={styles.historyItemScore}>Score {entry.ecoScore}</Text>
                  </View>
                  <Text style={styles.historyItemMeta}>
                    {entry.category} • {new Date(entry.timestamp).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
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
    goalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    goalWeekText: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    goalProgressTrack: {
      height: 10,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: palette.input,
      borderWidth: 1,
      borderColor: palette.border,
    },
    goalProgressFill: {
      height: '100%',
      backgroundColor: '#16A34A',
    },
    goalStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    goalStatText: {
      color: palette.textPrimary,
      fontSize: 12,
      fontWeight: '700',
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
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: palette.action,
      shadowOpacity: 0.14,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
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
    loadingButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    loadingButtonText: {
      color: palette.actionText,
      fontSize: 14,
      fontWeight: '700',
    },
    skeletonCard: {
      backgroundColor: palette.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    skeletonTitle: {
      color: palette.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    skeletonLineLg: {
      height: 20,
      borderRadius: 6,
      backgroundColor: palette.cardAlt,
      borderWidth: 1,
      borderColor: palette.border,
    },
    skeletonRow: {
      flexDirection: 'row',
      gap: 10,
    },
    skeletonMetric: {
      flex: 1,
      height: 56,
      borderRadius: 10,
      backgroundColor: palette.cardAlt,
      borderWidth: 1,
      borderColor: palette.border,
    },
    skeletonLineMd: {
      height: 16,
      borderRadius: 6,
      width: '88%',
      backgroundColor: palette.cardAlt,
      borderWidth: 1,
      borderColor: palette.border,
    },
    skeletonLineSm: {
      height: 16,
      borderRadius: 6,
      width: '64%',
      backgroundColor: palette.cardAlt,
      borderWidth: 1,
      borderColor: palette.border,
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
    quickActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    secondaryActionButton: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.input,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    secondaryActionText: {
      color: palette.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    suggestionChip: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.input,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    suggestionChipText: {
      color: palette.textPrimary,
      fontSize: 12,
      fontWeight: '600',
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
    historyHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    filterPill: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.input,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    filterPillActive: {
      borderColor: '#EF4444',
      backgroundColor: '#FEE2E2',
    },
    filterPillText: {
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    filterPillTextActive: {
      color: '#7F1D1D',
    },
    historyStatsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    historyStatCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.cardAlt,
      borderRadius: 10,
      padding: 10,
      gap: 2,
    },
    historyStatLabel: {
      color: palette.textSecondary,
      fontSize: 11,
    },
    historyStatValue: {
      color: palette.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    historyEmpty: {
      color: palette.textSecondary,
      fontSize: 13,
    },
    historyList: {
      gap: 8,
    },
    historyItem: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.cardAlt,
      borderRadius: 10,
      padding: 10,
      gap: 4,
    },
    historyItemTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    historyItemTitle: {
      color: palette.textPrimary,
      fontWeight: '700',
      flex: 1,
    },
    historyItemScore: {
      color: palette.textPrimary,
      fontWeight: '800',
      fontSize: 12,
    },
    historyItemMeta: {
      color: palette.textSecondary,
      fontSize: 12,
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
