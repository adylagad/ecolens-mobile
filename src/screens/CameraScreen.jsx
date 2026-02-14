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
import { submitTrainingSample } from '../services/training/trainingSampleService';
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
  if (runtime.engine === 'manual-label') {
    return 'Manual label';
  }
  if (runtime.engine === RECOGNITION_ENGINES.ON_DEVICE && runtime.degradedToOnDevice) {
    return 'On-device (backend fallback unavailable)';
  }
  const engine = runtime.engine === RECOGNITION_ENGINES.ON_DEVICE ? 'On-device' : 'Backend';
  if (runtime.fallbackFrom === RECOGNITION_ENGINES.ON_DEVICE) {
    return `${engine} (fallback from on-device)`;
  }
  return engine;
}

function buildRuntimeBadge(runtime, themeName = 'dark') {
  const isLight = themeName === 'light';
  if (!runtime || typeof runtime !== 'object') {
    return {
      label: 'Source: Unknown',
      bg: isLight ? '#E2E8F0' : 'rgba(148, 163, 184, 0.16)',
      text: isLight ? '#334155' : '#E2E8F0',
      border: isLight ? '#CBD5E1' : 'rgba(148, 163, 184, 0.35)',
    };
  }

  if (runtime.engine === 'manual-label') {
    return {
      label: 'Source: Manual label',
      bg: isLight ? '#EDE9FE' : 'rgba(167, 139, 250, 0.18)',
      text: isLight ? '#5B21B6' : '#DDD6FE',
      border: isLight ? '#C4B5FD' : 'rgba(196, 181, 253, 0.36)',
    };
  }

  if (runtime.engine === RECOGNITION_ENGINES.ON_DEVICE && runtime.degradedToOnDevice) {
    return {
      label: 'Source: On-device (degraded)',
      bg: isLight ? '#FEF3C7' : 'rgba(245, 158, 11, 0.14)',
      text: isLight ? '#92400E' : '#FCD34D',
      border: isLight ? '#FCD34D' : 'rgba(251, 191, 36, 0.32)',
    };
  }

  if (runtime.engine === RECOGNITION_ENGINES.BACKEND && runtime.fallbackFrom === RECOGNITION_ENGINES.ON_DEVICE) {
    return {
      label: 'Source: Backend fallback',
      bg: isLight ? '#FEF3C7' : 'rgba(245, 158, 11, 0.14)',
      text: isLight ? '#92400E' : '#FCD34D',
      border: isLight ? '#FCD34D' : 'rgba(251, 191, 36, 0.32)',
    };
  }

  if (runtime.engine === RECOGNITION_ENGINES.BACKEND) {
    return {
      label: 'Source: Backend',
      bg: isLight ? '#DBEAFE' : 'rgba(59, 130, 246, 0.18)',
      text: isLight ? '#1D4ED8' : '#BFDBFE',
      border: isLight ? '#93C5FD' : 'rgba(96, 165, 250, 0.36)',
    };
  }

  return {
    label: 'Source: On-device',
    bg: isLight ? '#DCFCE7' : 'rgba(34, 197, 94, 0.16)',
    text: isLight ? '#166534' : '#BBF7D0',
    border: isLight ? '#86EFAC' : 'rgba(74, 222, 128, 0.34)',
  };
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

function normalizeCandidateLabel(value) {
  const cleaned = String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return '';
  }
  return cleaned
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPredictionConfirmOptions(result, manualOptions) {
  const out = [];
  const seen = new Set();

  const topPredictions = Array.isArray(result?.topPredictions) ? result.topPredictions : [];
  for (const prediction of topPredictions) {
    const rawName = String(prediction?.name ?? '').trim();
    if (!rawName) {
      continue;
    }
    const normalized = normalizeCandidateLabel(rawName);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (key.startsWith('class ') || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ label: normalized, value: normalized });
    if (out.length >= 3) {
      break;
    }
  }

  for (const option of manualOptions) {
    const key = String(option.value ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(option);
    if (out.length >= 3) {
      break;
    }
  }

  return out.slice(0, 3);
}

function inferCategoryFromLabelText(label) {
  const text = String(label ?? '').toLowerCase();
  if (!text) {
    return null;
  }
  if (text.includes('bottle') || text.includes('flask') || text.includes('thermos') || text.includes('tumbler') || text.includes('canteen')) {
    if (text.includes('plastic') || text.includes('single-use') || text.includes('single use')) {
      return 'single-use-plastic-bottle';
    }
    return 'reusable-hydration';
  }
  if (text.includes('lunch box') || text.includes('lunchbox') || text.includes('food container')) {
    return 'reusable-container';
  }
  if (text.includes('cup') || text.includes('straw') || text.includes('wrapper') || text.includes('packaging')) {
    return 'single-use-item';
  }
  if (text.includes('packet') || text.includes('carton') || text.includes('sachet') || text.includes('takeout')) {
    return 'packaging';
  }
  if (text.includes('laptop') || text.includes('phone') || text.includes('charger') || text.includes('camera')) {
    return 'electronic-device';
  }
  if (text.includes('shirt') || text.includes('jeans') || text.includes('jacket') || text.includes('hoodie')) {
    return 'apparel';
  }
  if (text.includes('bag') || text.includes('shoe') || text.includes('chair') || text.includes('table')) {
    return 'durable-household';
  }
  return 'general-object';
}

function clampEcoScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 55;
  }
  return Math.max(5, Math.min(96, Math.round(numeric)));
}

function containsAnyToken(text, tokens) {
  return tokens.some((token) => text.includes(token));
}

function buildConfirmedProfile(label, previousResult = {}) {
  const normalizedLabel = normalizeCandidateLabel(label);
  const text = normalizedLabel.toLowerCase();
  const category = inferCategoryFromLabelText(normalizedLabel) || 'general-object';

  const factors = [];
  const addFactor = (code, labelText, detail, delta) => {
    factors.push({ code, label: labelText, detail, delta });
  };

  let score = 55;

  const isReusable = containsAnyToken(text, [
    'reusable', 'refillable', 'stainless', 'steel', 'glass', 'metal',
    'thermos', 'tumbler', 'canteen', 'flask', 'durable', 'long lasting'
  ]);
  const isSingleUse = containsAnyToken(text, [
    'single-use', 'single use', 'disposable', 'wrapper', 'styrofoam', 'foam cup',
    'paper cup', 'plastic cup', 'plastic straw', 'takeout', 'to go'
  ]);
  const isPlastic = containsAnyToken(text, ['plastic', 'pet', 'polyethylene', 'polythene']);
  const isPaper = containsAnyToken(text, ['paper', 'cardboard', 'carton']);
  const isElectronics = category === 'electronic-device';
  const isDurable = category === 'durable-household';
  const isApparel = category === 'apparel';

  if (isReusable) {
    score += 18;
    addFactor('confirmed_reusable', 'Reusable pattern', 'Confirmed label suggests repeated use and refillability.', +18);
  }
  if (isSingleUse) {
    score -= 24;
    addFactor('confirmed_single_use', 'Single-use pattern', 'Confirmed label indicates disposable lifecycle.', -24);
  }
  if (isPlastic && !isReusable) {
    score -= 10;
    addFactor('confirmed_plastic', 'Plastic material impact', 'Plastic-heavy item likely has higher waste burden.', -10);
  }
  if (isPaper && !isSingleUse) {
    score += 3;
    addFactor('confirmed_paper', 'Paper/cardboard material', 'Often easier to recycle than mixed plastics.', +3);
  }
  if (isElectronics) {
    score -= 6;
    addFactor('confirmed_electronics', 'Manufacturing footprint', 'Electronics carry high embodied impact; lifespan matters most.', -6);
  }
  if (isDurable) {
    score += 6;
    addFactor('confirmed_durable', 'Durability advantage', 'Longer usable life can amortize footprint.', +6);
  }
  if (isApparel) {
    score -= 2;
    addFactor('confirmed_apparel', 'Textile footprint', 'Fabric production impact depends on materials and wear lifetime.', -2);
  }
  if (category === 'reusable-hydration') {
    score += 18;
    addFactor('confirmed_reusable_hydration', 'Reusable hydration profile', 'Confirmed bottle/flask pattern maps to high reuse potential.', +18);
  }
  if (category === 'reusable-container') {
    score += 12;
    addFactor('confirmed_reusable_container', 'Reusable container profile', 'Container likely avoids repeated disposable packaging.', +12);
  }
  if (category === 'single-use-plastic-bottle') {
    score -= 20;
    addFactor('confirmed_su_plastic_bottle', 'Single-use plastic bottle profile', 'Frequent replacement and disposal pattern lowers score.', -20);
  }
  if (category === 'single-use-item' || category === 'packaging') {
    score -= 12;
    addFactor('confirmed_disposable_profile', 'Disposable profile', 'Confirmed label maps to common disposable usage.', -12);
  }

  const ecoScore = clampEcoScore(score);

  const baseCo2ByCategory = {
    'reusable-hydration': 35,
    'reusable-container': 42,
    'single-use-plastic-bottle': 152,
    'single-use-item': 145,
    packaging: 130,
    'electronic-device': 125,
    'durable-household': 86,
    apparel: 96,
    'general-object': 108,
  };
  const categoryBase = baseCo2ByCategory[category] ?? baseCo2ByCategory['general-object'];
  const co2Gram = Math.max(12, Math.round(categoryBase + (60 - ecoScore) * 0.8));

  let suggestion = 'Choose durable, reusable options when practical.';
  if (category === 'reusable-hydration' || category === 'reusable-container') {
    suggestion = 'Keep using this reusable item and refill/repair before replacing.';
  } else if (category === 'single-use-plastic-bottle') {
    suggestion = 'Switch to a refillable stainless steel or glass bottle.';
  } else if (category === 'single-use-item' || category === 'packaging') {
    suggestion = 'Prefer reusable alternatives or lower-packaging options.';
  } else if (category === 'electronic-device') {
    suggestion = 'Extend device life with repair, and buy refurbished when possible.';
  } else if (category === 'durable-household') {
    suggestion = 'Maintain and repair this item to maximize its useful lifetime.';
  } else if (category === 'apparel') {
    suggestion = 'Choose durable fabrics and wear longer before replacing.';
  }

  const explanationParts = [
    `User confirmed label: ${normalizedLabel}.`,
    `Category inferred: ${category.replace(/-/g, ' ')}.`,
    `Score adjusted using material/use-pattern heuristics for confirmed items.`,
  ];

  return {
    title: normalizedLabel,
    name: normalizedLabel,
    category,
    ecoScore,
    co2Gram,
    suggestion,
    altRecommendation: suggestion,
    explanation: explanationParts.join(' '),
    scoreFactors: factors.length
      ? factors
      : [
          {
            code: 'confirmed_baseline',
            label: 'Confirmed-item baseline',
            detail: 'No strong heuristic signals were found; baseline confirmed-item score applied.',
            delta: 0,
          },
        ],
  };
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

  if (combined.includes('plastic bottle') || combined.includes('single-use-plastic-bottle')) {
    return ['Reusable Bottle', 'Glass Bottle', 'Insulated Reusable Bottle'];
  }
  if (combined.includes('paper cup') || combined.includes('coffee cup')) {
    return ['Refillable Coffee Cup', 'Stainless Steel Tumbler', 'Bring-your-own mug'];
  }
  if (combined.includes('reusable-hydration') || combined.includes('thermos') || combined.includes('flask')) {
    return ['Keep and refill this bottle', 'Replace worn seals instead of replacing bottle', 'Use tap/filter refills'];
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
  if (combined.includes('electronic-device') || combined.includes('laptop') || combined.includes('phone')) {
    return ['Repair before replacing', 'Buy refurbished when possible', 'Recycle e-waste at certified drop-off'];
  }
  if (combined.includes('clothing') || combined.includes('shoe') || combined.includes('backpack')) {
    return ['Choose durable materials', 'Repair or resole before replacing', 'Buy second-hand for similar items'];
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

  if (combined.includes('plastic bottle') || combined.includes('single-use-plastic-bottle')) {
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
  if (combined.includes('packaging')) {
    return 'Low-packaging alternative';
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
  authToken = '',
  themeName = 'dark',
  showToast = () => {},
}) {
  const cameraProviderRef = useRef(null);
  const scrollViewRef = useRef(null);
  const resultCardYRef = useRef(0);
  const lastCapturedImageRef = useRef('');
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
  const [customConfirmLabel, setCustomConfirmLabel] = useState('');

  const palette = THEMES[themeName] ?? THEMES.dark;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const selectedLabelMatch = LABEL_OPTIONS.find((option) => option.value === selectedLabel);
  const selectedLabelText = selectedLabelMatch?.label || (selectedLabel ? selectedLabel : LABEL_OPTIONS[0].label);
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
      setCustomConfirmLabel('');
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

  const withAuthHeader = (headers = {}) => {
    const token = String(authToken ?? '').trim();
    if (!token) {
      return headers;
    }
    return {
      ...headers,
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
    const controller = new AbortController();
    let timeoutId = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          const timeoutError = new Error('Request timed out.');
          timeoutError.code = 'REQUEST_TIMEOUT';
          reject(timeoutError);
        }, timeoutMs);
      });
      return await Promise.race([fetch(url, {
        ...options,
        signal: controller.signal,
      }), timeoutPromise]);
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'REQUEST_TIMEOUT') {
        const timeoutError = new Error('Request timed out.');
        timeoutError.code = 'REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const executeRecognition = async (payload, preferredEngine = inferenceEngine) => {
    return recognizeItem({
      payload,
      apiBaseUrl,
      preferredEngine,
      authToken,
    });
  };

  const handleAnalyze = async (manualOverrideLabel = null) => {
    if (loading) {
      return;
    }
    setLoading(true);
    setResult(null);
    setLastRuntime(null);

    let payload = {
      detectedLabel: '',
      confidence: 0.9,
    };

    try {
      const captureWithFallback = async () => {
        try {
          const captured = await cameraProviderRef.current?.captureImage();
          if (captured) {
            lastCapturedImageRef.current = captured;
            return captured;
          }
        } catch {
          // Fall through to bundled image fallback.
        }
        const fallback = await loadDefaultImageBase64();
        lastCapturedImageRef.current = fallback;
        return fallback;
      };

      if (manualOverrideLabel) {
        payload.detectedLabel = manualOverrideLabel;
        payload.imageBase64 = '';
      } else if (selectedLabel === '__test_image__') {
        const imageBase64 = await loadDefaultImageBase64();
        payload.detectedLabel = '';
        payload.imageBase64 = imageBase64;
        lastCapturedImageRef.current = imageBase64;
      } else if (!selectedLabel) {
        try {
          const imageBase64 = await cameraProviderRef.current?.captureImage();
          if (!imageBase64) {
            throw new Error('No image was captured.');
          }
          payload.imageBase64 = imageBase64;
          lastCapturedImageRef.current = imageBase64;
        } catch (captureError) {
          const imageBase64 = await loadDefaultImageBase64();
          payload.imageBase64 = imageBase64;
          lastCapturedImageRef.current = imageBase64;
          showToast(
            `Camera capture unavailable (${captureError.message}). Using bundled test image instead.`
          );
        }
      } else {
        payload.detectedLabel = selectedLabel;
        payload.imageBase64 = '';
      }

      const immediateLabel = normalizeCandidateLabel(
        manualOverrideLabel || (selectedLabel && selectedLabel !== '__test_image__' ? selectedLabel : '')
      );
      if (immediateLabel) {
        const localResult = {
          ...buildConfirmedProfile(immediateLabel, result),
          confidence: 0.95,
          explanation: manualOverrideLabel
            ? `User confirmed label: ${immediateLabel}.`
            : `Manual label selected: ${immediateLabel}.`,
        };
        const singleUse = isSingleUseResult(localResult);
        setGoalState((prev) => {
          const currentWeek = getWeekKey();
          const base =
            prev.weekKey === currentWeek
              ? prev
              : {
                  weekKey: currentWeek,
                  avoidedSingleUseCount: 0,
                  currentStreak: prev.currentStreak,
                  bestStreak: prev.bestStreak,
                };
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
        setResult(localResult);
        setLastRuntime({
          engine: 'manual-label',
          source: 'local-profile',
        });
        return;
      }

      const isPresetLabelFlow = Boolean(selectedLabel && selectedLabel !== '__test_image__');
      const preferredEngineForRun = (manualOverrideLabel || isPresetLabelFlow)
        ? RECOGNITION_ENGINES.BACKEND
        : inferenceEngine;
      const { data, runtime } = await executeRecognition(payload, preferredEngineForRun);
      const manualConfirmedLabel = normalizeCandidateLabel(manualOverrideLabel);
      const normalizedData =
        manualConfirmedLabel
          ? {
              ...data,
              ...buildConfirmedProfile(manualConfirmedLabel, data),
              confidence: Math.max(
                Number.isFinite(Number(data?.confidence)) ? Number(data.confidence) : 0,
                0.92
              ),
            }
          : data;
      const singleUse = isSingleUseResult(normalizedData);
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
      setResult(normalizedData);
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

  const handleConfirmLabel = (value) => {
    const normalized = normalizeCandidateLabel(value);
    if (!normalized) {
      showToast('Select or type a valid label first.', 'info');
      return;
    }
    if (!result) {
      showToast('No active scan result to confirm.', 'info');
      return;
    }

    const predictedLabel = String(result?.name ?? '').trim();
    const predictedConfidence = toFiniteNumber(result?.confidence);
    const confirmedResult = {
      ...result,
      ...buildConfirmedProfile(normalized, result),
      confidence: Math.max(predictedConfidence ?? 0, 0.92),
    };
    const capturedImageBase64 = String(lastCapturedImageRef.current ?? '').trim();

    setSelectedLabel(normalized);
    setCustomConfirmLabel(normalized);
    setResult(confirmedResult);

    if (!capturedImageBase64) {
      showToast(
        `Confirmed as "${normalized}", but no captured image was available for training sample upload.`,
        'info'
      );
      return;
    }

    submitTrainingSample({
      apiBaseUrl,
      authToken,
      imageBase64: capturedImageBase64,
      predictedLabel,
      predictedConfidence,
      finalLabel: normalized,
      sourceEngine: lastRuntime?.engine ?? inferenceEngine,
      sourceRuntime: lastRuntime?.fallbackFrom
        ? `fallback:${lastRuntime.fallbackFrom}`
        : String(lastRuntime?.engine ?? inferenceEngine),
      userConfirmed: true,
    })
      .then(() => {
        showToast(`Confirmed as "${normalized}" and added to training set.`, 'success');
      })
      .catch(() => {
        showToast(`Confirmed as "${normalized}". Training sync unavailable right now.`, 'info');
      });
  };

  const scoreTone = getScoreTone(result?.ecoScore, themeName);
  const confidenceTone = getConfidenceTone(result?.confidence, themeName);
  const runtimeBadge = buildRuntimeBadge(lastRuntime, themeName);
  const catalogCoveragePct =
    typeof result?.catalogCoverage === 'number' && Number.isFinite(result.catalogCoverage)
      ? Math.round(result.catalogCoverage * 100)
      : null;
  const catalogMatchStrategy = String(result?.catalogMatchStrategy ?? '').trim();
  const displayedConfidence = toFiniteNumber(result?.confidence);
  const onDeviceConfidence = toFiniteNumber(lastRuntime?.onDeviceConfidence);
  const onDeviceFallbackThreshold = toFiniteNumber(lastRuntime?.onDeviceFallbackThreshold);
  const runtimeLowConfidence = onDeviceConfidence !== null && onDeviceConfidence < (
    onDeviceFallbackThreshold !== null ? onDeviceFallbackThreshold : 0.6
  );
  const showLowConfidenceHelp =
    !loading && (
      (displayedConfidence !== null && displayedConfidence < 0.6) ||
      runtimeLowConfidence ||
      Boolean(lastRuntime?.degradedToOnDevice)
    );
  const lowConfidenceTitle = runtimeLowConfidence
    ? `Low on-device confidence (${onDeviceConfidence?.toFixed(3)}). Confirm the item:`
    : 'Low confidence. Confirm the item:';
  const suggestedConfirmLabels = useMemo(() => {
    if (!showLowConfidenceHelp || !result) {
      return manualLabelOptions.slice(0, 3);
    }
    return buildPredictionConfirmOptions(result, manualLabelOptions);
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
    if (!String(authToken ?? '').trim()) {
      showToast('Sign in with Google to save and load cloud history.', 'error');
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
      item: String(result.name ?? 'Unknown item'),
      category: String(result.category ?? 'unknown'),
      ecoScore,
      confidence,
    };

    try {
      const response = await fetchWithTimeout(buildApiUrl(apiBaseUrl, '/api/history'), {
        method: 'POST',
        headers: withAuthHeader({ 'Content-Type': 'application/json' }),
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
        const statsResponse = await fetchWithTimeout(buildApiUrl(apiBaseUrl, '/api/history/stats'), {
          headers: withAuthHeader({}),
        });
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
      if (apiMode === 'production') {
        const message = String(saveError?.message ?? '').trim();
        showToast(
          message ? `Cloud save failed: ${message}` : 'Cloud save failed. Please retry.',
          'error'
        );
        return;
      }
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

  const handleApplyCustomConfirmLabel = () => {
    const normalized = normalizeCandidateLabel(customConfirmLabel);
    if (!normalized) {
      showToast('Type an item name first.', 'info');
      return;
    }
    handleConfirmLabel(normalized);
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
                    { backgroundColor: runtimeBadge.bg, borderColor: runtimeBadge.border },
                  ]}
                >
                  <Text style={[styles.scoreBadgeText, { color: runtimeBadge.text }]}>
                    {runtimeBadge.label}
                  </Text>
                </View>
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
                <Text style={styles.confirmTitle}>{lowConfidenceTitle}</Text>
                <View style={styles.confirmChipRow}>
                  {suggestedConfirmLabels.map((option) => (
                    <Pressable
                      key={option.value}
                      style={styles.confirmChip}
                      onPress={() => handleConfirmLabel(option.value)}
                    >
                      <Text style={styles.confirmChipText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {runtimeLowConfidence ? (
                  <Text style={styles.confirmHint}>
                    Confirming the label here writes a training sample for future model retraining.
                  </Text>
                ) : null}
                <Text style={styles.confirmHint}>Not listed? Type your own label:</Text>
                <View style={styles.confirmInputRow}>
                  <TextInput
                    value={customConfirmLabel}
                    onChangeText={setCustomConfirmLabel}
                    style={styles.confirmInput}
                    placeholder="e.g. Stainless steel bottle, Laptop charger, Food container"
                    placeholderTextColor={palette.textSecondary}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleApplyCustomConfirmLabel}
                  />
                  <Pressable style={styles.confirmApplyButton} onPress={handleApplyCustomConfirmLabel}>
                    <Text style={styles.confirmApplyText}>Use this label</Text>
                  </Pressable>
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
    confirmHint: {
      color: palette.textSecondary,
      fontSize: 12,
      marginTop: 2,
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
    confirmInputRow: {
      marginTop: 2,
      gap: 8,
    },
    confirmInput: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.input,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      color: palette.textPrimary,
      fontSize: 13,
    },
    confirmApplyButton: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: palette.action,
      backgroundColor: palette.actionMuted,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    confirmApplyText: {
      color: palette.actionText,
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
