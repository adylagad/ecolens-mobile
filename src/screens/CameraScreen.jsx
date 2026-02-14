import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
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
import { TEST_IMAGE_BASE64 } from '../config/testImageBase64';
import { RECOGNITION_ENGINES, recognizeItem } from '../services/recognition/recognitionService';
import { THEMES } from '../theme';
import { buildApiUrl } from '../utils/apiUrl';

const LABEL_OPTIONS = [
  { label: 'Auto-detect from camera', value: '' },
  { label: 'Use bundled test image', value: '__test_image__' },
  { label: 'Single-use Plastic Bottle', value: 'Single-use Plastic Bottle' },
  { label: 'Paper Coffee Cup', value: 'Paper Coffee Cup' },
  { label: 'LED Light Bulb', value: 'LED Light Bulb' },
];

function getScoreTone(score, themeName = 'dark') {
  const isLight = themeName === 'light';
  if (typeof score !== 'number') {
    return isLight
      ? { bg: '#E2E8F0', text: '#334155', border: '#CBD5E1', label: 'N/A' }
      : { bg: 'rgba(148, 163, 184, 0.16)', text: '#E2E8F0', border: 'rgba(148, 163, 184, 0.35)', label: 'N/A' };
  }
  if (score >= 85) {
    return isLight
      ? { bg: '#DCFCE7', text: '#166534', border: '#86EFAC', label: 'Excellent' }
      : { bg: 'rgba(34, 197, 94, 0.16)', text: '#BBF7D0', border: 'rgba(74, 222, 128, 0.34)', label: 'Excellent' };
  }
  if (score >= 60) {
    return isLight
      ? { bg: '#ECFCCB', text: '#3F6212', border: '#BEF264', label: 'Good' }
      : { bg: 'rgba(132, 204, 22, 0.16)', text: '#D9F99D', border: 'rgba(163, 230, 53, 0.34)', label: 'Good' };
  }
  if (score >= 40) {
    return isLight
      ? { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', label: 'Fair' }
      : { bg: 'rgba(245, 158, 11, 0.14)', text: '#FCD34D', border: 'rgba(251, 191, 36, 0.32)', label: 'Fair' };
  }
  return isLight
    ? { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', label: 'High Impact' }
    : { bg: 'rgba(239, 68, 68, 0.16)', text: '#FCA5A5', border: 'rgba(248, 113, 113, 0.34)', label: 'High Impact' };
}

function getConfidenceTone(confidence, themeName = 'dark') {
  const isLight = themeName === 'light';
  if (typeof confidence !== 'number') {
    return isLight
      ? { bg: '#E2E8F0', text: '#334155', border: '#CBD5E1', label: 'Unknown' }
      : { bg: 'rgba(148, 163, 184, 0.16)', text: '#E2E8F0', border: 'rgba(148, 163, 184, 0.35)', label: 'Unknown' };
  }
  if (confidence >= 0.8) {
    return isLight
      ? { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD', label: 'Confidence: High' }
      : { bg: 'rgba(59, 130, 246, 0.18)', text: '#BFDBFE', border: 'rgba(96, 165, 250, 0.36)', label: 'Confidence: High' };
  }
  if (confidence >= 0.6) {
    return isLight
      ? { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', label: 'Confidence: Medium' }
      : { bg: 'rgba(245, 158, 11, 0.14)', text: '#FCD34D', border: 'rgba(251, 191, 36, 0.32)', label: 'Confidence: Medium' };
  }
  return isLight
    ? { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', label: 'Confidence: Low' }
    : { bg: 'rgba(239, 68, 68, 0.16)', text: '#FCA5A5', border: 'rgba(248, 113, 113, 0.34)', label: 'Confidence: Low' };
}

const GOAL_TARGET = 5;
const INFERENCE_OPTIONS = [
  { label: 'Auto', value: RECOGNITION_ENGINES.AUTO },
  { label: 'On-device', value: RECOGNITION_ENGINES.ON_DEVICE },
  { label: 'Backend', value: RECOGNITION_ENGINES.BACKEND },
];
const LOADING_STAGES_BY_ENGINE = {
  [RECOGNITION_ENGINES.AUTO]: ['Preparing', 'Detecting', 'Summarizing'],
  [RECOGNITION_ENGINES.ON_DEVICE]: ['Preparing', 'Running on-device', 'Summarizing'],
  [RECOGNITION_ENGINES.BACKEND]: ['Uploading', 'Detecting', 'Scoring'],
};

function getInferenceLabel(engine) {
  if (engine === RECOGNITION_ENGINES.ON_DEVICE) {
    return 'On-device';
  }
  if (engine === RECOGNITION_ENGINES.BACKEND) {
    return 'Backend';
  }
  return 'Auto';
}

function buildRuntimeLabel(runtime) {
  if (!runtime || typeof runtime !== 'object') {
    return 'No inference yet';
  }
  const engine = runtime.engine === RECOGNITION_ENGINES.ON_DEVICE ? 'On-device' : 'Backend';
  if (runtime.fallbackFrom === RECOGNITION_ENGINES.ON_DEVICE) {
    return `${engine} (fallback from on-device)`;
  }
  return engine;
}

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

function formatScoreFactorDelta(delta) {
  if (typeof delta === 'number' && Number.isFinite(delta)) {
    const normalized = Number(delta.toFixed(2));
    if (normalized > 0) {
      return `+${normalized}`;
    }
    if (normalized < 0) {
      return `${normalized}`;
    }
    return '0';
  }
  const raw = String(delta ?? '').trim();
  if (!raw) {
    return '0';
  }
  if (raw.startsWith('+') || raw.startsWith('-')) {
    return raw;
  }
  const asNumber = Number.parseFloat(raw);
  if (Number.isFinite(asNumber)) {
    const normalized = Number(asNumber.toFixed(2));
    if (normalized > 0) {
      return `+${normalized}`;
    }
    if (normalized < 0) {
      return `${normalized}`;
    }
    return '0';
  }
  return raw;
}

function buildScoreBreakdownFromApi(result) {
  if (!result || !Array.isArray(result.scoreFactors) || !result.scoreFactors.length) {
    return [];
  }
  return result.scoreFactors.map((factor, index) => ({
    code: String(factor?.code ?? `factor-${index}`),
    label: String(factor?.label ?? factor?.code ?? 'Score factor'),
    detail: String(factor?.detail ?? '').trim(),
    delta: formatScoreFactorDelta(factor?.delta),
  }));
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

export default function CameraScreen({
  setScanHistory = () => {},
  setHistoryStats = () => {},
  historyThresholds = null,
  setGoalState = () => {},
  apiMode = 'production',
  setApiMode = () => {},
  devBaseUrl = '',
  setDevBaseUrl = () => {},
  apiBaseUrl = '',
  userId = '',
  themeName = 'dark',
  showToast = () => {},
}) {
  const cameraProviderRef = useRef(null);
  const scrollViewRef = useRef(null);
  const resultCardYRef = useRef(0);
  const resultAnim = useRef(new Animated.Value(0)).current;

  const [selectedLabel, setSelectedLabel] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [inferenceEngine, setInferenceEngine] = useState(RECOGNITION_ENGINES.AUTO);
  const [loading, setLoading] = useState(false);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [lastRuntime, setLastRuntime] = useState(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [queuedRequests, setQueuedRequests] = useState([]);

  const palette = THEMES[themeName] ?? THEMES.dark;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const selectedLabelText =
    LABEL_OPTIONS.find((option) => option.value === selectedLabel)?.label || LABEL_OPTIONS[0].label;
  const manualLabelOptions = LABEL_OPTIONS.filter(
    (option) => option.value && option.value !== '__test_image__'
  );
  const loadingStages = useMemo(() => {
    return LOADING_STAGES_BY_ENGINE[inferenceEngine] || LOADING_STAGES_BY_ENGINE[RECOGNITION_ENGINES.AUTO];
  }, [inferenceEngine]);
  const highImpactThreshold =
    typeof historyThresholds?.highImpactThreshold === 'number' &&
    Number.isFinite(historyThresholds.highImpactThreshold)
      ? historyThresholds.highImpactThreshold
      : 40;
  const greenerThreshold =
    typeof historyThresholds?.greenerThreshold === 'number' &&
    Number.isFinite(historyThresholds.greenerThreshold)
      ? historyThresholds.greenerThreshold
      : 85;

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
      setLoadingStageIndex((prev) => (prev + 1) % loadingStages.length);
    }, 900);
    return () => clearInterval(interval);
  }, [loading, loadingStages]);

  const loadingStage = loadingStages[loadingStageIndex];

  const loadDefaultImageBase64 = async () => TEST_IMAGE_BASE64;

  const executeRecognition = async (payload, preferredEngine = inferenceEngine) => {
    return recognizeItem({
      payload,
      apiBaseUrl,
      preferredEngine,
    });
  };

  const handleAnalyze = async (manualOverrideLabel = null) => {
    setLoading(true);
    setResult(null);
    setLastRuntime(null);

    let payload = {
      detectedLabel: '',
      confidence: 0.9,
    };

    try {

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
          showToast(
            `Camera capture unavailable (${captureError.message}). Using bundled test image instead.`
          );
        }
      } else {
        payload.detectedLabel = selectedLabel;
      }

      const { data, runtime } = await executeRecognition(payload, inferenceEngine);
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
      setLastRuntime(runtime ?? null);
    } catch (fetchError) {
      const maybeOffline =
        !fetchError.code &&
        (String(fetchError.message).includes('Network request failed') ||
          String(fetchError.message).includes('Failed to fetch'));
      if (maybeOffline) {
        const queued = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          payload,
          preferredEngine: inferenceEngine,
          createdAt: new Date().toISOString(),
        };
        setQueuedRequests((prev) => [queued, ...prev].slice(0, 20));
        showToast('You appear offline. Scan request queued.', 'error');
      } else {
        showToast(
          fetchError.message
            ? `Could not analyze right now: ${fetchError.message}`
            : 'Could not analyze right now. Please check app and backend logs.',
          'error'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetryQueued = async () => {
    if (!queuedRequests.length || loading) {
      return;
    }
    setLoading(true);
    setLastRuntime(null);
    const [next, ...rest] = queuedRequests;
    try {
      const { data, runtime } = await executeRecognition(
        next.payload,
        next.preferredEngine || RECOGNITION_ENGINES.AUTO
      );
      setResult(data);
      setLastRuntime(runtime ?? null);
      setQueuedRequests(rest);
      showToast('Queued scan processed successfully.', 'success');
    } catch (retryError) {
      showToast(
        retryError.message
          ? `Retry failed: ${retryError.message}`
          : 'Retry failed. You may still be offline.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const scoreTone = getScoreTone(result?.ecoScore, themeName);
  const confidenceTone = getConfidenceTone(result?.confidence, themeName);
  const catalogCoveragePct =
    typeof result?.catalogCoverage === 'number' && Number.isFinite(result.catalogCoverage)
      ? Math.round(result.catalogCoverage * 100)
      : null;
  const catalogMatchStrategy = String(result?.catalogMatchStrategy ?? '').trim();
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
  const scoreBreakdown = useMemo(() => {
    const apiRows = buildScoreBreakdownFromApi(result);
    if (apiRows.length) {
      return apiRows;
    }
    return buildScoreBreakdown(result);
  }, [result]);
  const alternativeSuggestions = useMemo(() => getAlternativeSuggestions(result), [result]);
  const greenerLabel = useMemo(() => getGreenerAlternativeLabel(result), [result]);

  const handleScanAgain = () => {
    setResult(null);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 50);
  };

  const handleSaveResult = async () => {
    if (!result) {
      return;
    }
    const ecoScore =
      typeof result.ecoScore === 'number' && Number.isFinite(result.ecoScore)
        ? Math.round(result.ecoScore)
        : Number.parseInt(String(result.ecoScore ?? '0'), 10) || 0;
    const confidence =
      typeof result.confidence === 'number' && Number.isFinite(result.confidence)
        ? result.confidence
        : Number.parseFloat(String(result.confidence ?? '0')) || 0;
    const requestBody = {
      userId: userId || 'anonymous',
      item: String(result.name ?? 'Unknown item'),
      category: String(result.category ?? 'unknown'),
      ecoScore,
      confidence,
    };

    try {
      const userQuery = `userId=${encodeURIComponent(requestBody.userId)}`;
      const response = await fetch(`${buildApiUrl(apiBaseUrl, '/api/history')}?${userQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      let savedEntry = null;
      try {
        savedEntry = await response.json();
      } catch (parseError) {
        savedEntry = null;
      }

      if (!response.ok) {
        throw new Error(savedEntry?.message || `Save failed (${response.status})`);
      }

      const normalizedEntry = {
        id: String(savedEntry?.id ?? Date.now()),
        item: String(savedEntry?.item ?? requestBody.item),
        category: String(savedEntry?.category ?? requestBody.category),
        ecoScore:
          typeof savedEntry?.ecoScore === 'number' ? savedEntry.ecoScore : requestBody.ecoScore,
        confidence:
          typeof savedEntry?.confidence === 'number'
            ? savedEntry.confidence
            : requestBody.confidence,
        timestamp: String(savedEntry?.timestamp ?? new Date().toISOString()),
      };

      setScanHistory((prev) => [normalizedEntry, ...prev].slice(0, 40));

      try {
        const statsResponse = await fetch(`${buildApiUrl(apiBaseUrl, '/api/history/stats')}?${userQuery}`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setHistoryStats((prev) => ({
            avgScore: statsData?.avgScore ?? null,
            highImpactCount: statsData?.highImpactCount ?? 0,
            greenerCount: statsData?.greenerCount ?? 0,
            highImpactThreshold:
              typeof statsData?.highImpactThreshold === 'number'
                ? statsData.highImpactThreshold
                : prev?.highImpactThreshold ?? highImpactThreshold,
            greenerThreshold:
              typeof statsData?.greenerThreshold === 'number'
                ? statsData.greenerThreshold
                : prev?.greenerThreshold ?? greenerThreshold,
          }));
        }
      } catch (statsError) {
        // Keep UI responsive even if stats refresh fails.
      }

      showToast('Saved to backend history.', 'success');
      return;
    } catch (saveError) {
      const fallbackEntry = {
        id: `${Date.now()}`,
        item: requestBody.item,
        category: requestBody.category,
        ecoScore: requestBody.ecoScore,
        confidence: requestBody.confidence,
        timestamp: new Date().toISOString(),
      };
      setScanHistory((prev) => {
        const nextHistory = [fallbackEntry, ...prev].slice(0, 40);
        const total = nextHistory.length;
        const avgScore = total
          ? nextHistory.reduce((sum, entry) => sum + (Number(entry.ecoScore) || 0), 0) / total
          : null;
        const highImpactCount = nextHistory.filter((entry) => Number(entry.ecoScore) < highImpactThreshold).length;
        const greenerCount = nextHistory.filter((entry) => Number(entry.ecoScore) >= greenerThreshold).length;
        setHistoryStats({
          avgScore,
          highImpactCount,
          greenerCount,
          highImpactThreshold,
          greenerThreshold,
        });
        return nextHistory;
      });
      showToast('Saved locally. Backend history was unavailable.', 'info');
    }
  };

  const handleTryGreenerAlternative = () => {
    if (!greenerLabel) {
      showToast('No mapped greener alternative yet for this item.', 'info');
      return;
    }
    setSelectedLabel(greenerLabel);
    handleAnalyze(greenerLabel);
  };

  const handleVoiceSummary = () => {
    if (!result) {
      return;
    }
    const summary = `${result.name ?? 'Item'}. Eco score ${result.ecoScore ?? '-'} out of 100. ${
      result.altRecommendation ?? 'No alternative suggestion.'
    }`;
    AccessibilityInfo.announceForAccessibility(summary);
    showToast('Voice summary announced for accessibility.', 'info');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
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
                placeholderTextColor={palette.textSecondary}
              />
            </View>
          ) : null}

          <Text style={styles.endpointText}>Active endpoint: {apiBaseUrl}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Inference Engine</Text>
          <Text style={styles.sectionHint}>Choose where detection + summary runs.</Text>

          <View style={styles.modeRow}>
            {INFERENCE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setInferenceEngine(option.value)}
                style={[styles.modeButton, inferenceEngine === option.value ? styles.modeButtonActive : null]}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    inferenceEngine === option.value ? styles.modeButtonTextActive : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.endpointText}>Preferred engine: {getInferenceLabel(inferenceEngine)}</Text>
          <Text style={styles.endpointText}>Last run: {buildRuntimeLabel(lastRuntime)}</Text>
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

        {queuedRequests.length ? (
          <View style={[styles.noticeCard, styles.queuedCard]}>
            <View style={styles.queuedHeader}>
              <Text style={styles.noticeText} maxFontSizeMultiplier={1.4}>
                Offline queue pending: {queuedRequests.length}
              </Text>
              <Pressable style={styles.retryBadge} onPress={handleRetryQueued}>
                <Text style={styles.retryBadgeText}>Retry now</Text>
              </Pressable>
            </View>
            <Text style={styles.queuedMeta}>
              Oldest queued at {new Date(queuedRequests[queuedRequests.length - 1].createdAt).toLocaleTimeString()}
            </Text>
          </View>
        ) : null}

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
                <View
                  style={[
                    styles.scoreBadge,
                    { backgroundColor: scoreTone.bg, borderColor: scoreTone.border },
                  ]}
                >
                  <Text style={[styles.scoreBadgeText, { color: scoreTone.text }]}>
                    {scoreTone.label}
                  </Text>
                </View>
                <View
                  style={[
                    styles.scoreBadge,
                    { backgroundColor: confidenceTone.bg, borderColor: confidenceTone.border },
                  ]}
                >
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
            {catalogCoveragePct !== null ? (
              <Text style={styles.resultFootnote}>
                Catalog coverage: {catalogCoveragePct}%{catalogMatchStrategy ? ` (${catalogMatchStrategy})` : ''}
              </Text>
            ) : null}

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
              <Pressable style={styles.secondaryActionButton} onPress={handleVoiceSummary}>
                <Text style={styles.secondaryActionText}>Voice summary</Text>
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
                    <View key={`${row.code ?? row.label}-${index}`} style={styles.breakdownRow}>
                      <View style={styles.breakdownLabelBlock}>
                        <Text style={styles.breakdownLabel}>{row.label}</Text>
                        {row.detail ? <Text style={styles.breakdownDetail}>{row.detail}</Text> : null}
                      </View>
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
    eyebrow: {
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: '#38BDF8',
      fontWeight: '700',
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
      minHeight: 48,
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
      minHeight: 50,
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
      minHeight: 58,
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
    queuedCard: {
      backgroundColor: '#FEF9C3',
      borderColor: '#EAB308',
    },
    queuedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    retryBadge: {
      minHeight: 34,
      borderRadius: 999,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: '#B45309',
      backgroundColor: '#FCD34D',
      justifyContent: 'center',
    },
    retryBadgeText: {
      color: '#78350F',
      fontSize: 12,
      fontWeight: '800',
    },
    queuedMeta: {
      color: '#7C2D12',
      fontSize: 12,
      marginTop: 6,
    },
    noticeText: {
      color: palette.textPrimary,
      fontSize: 13,
      lineHeight: 18,
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
      borderWidth: 1,
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
      paddingVertical: 10,
      minHeight: 40,
      justifyContent: 'center',
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
    breakdownLabelBlock: {
      flex: 1,
      gap: 2,
    },
    breakdownDetail: {
      color: palette.textMuted,
      fontSize: 11,
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
