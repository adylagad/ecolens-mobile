import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import CameraScreen from './src/screens/CameraScreen.jsx';
import GoalsScreen from './src/screens/GoalsScreen.jsx';
import HomeScreen from './src/screens/HomeScreen.jsx';
import HistoryScreen from './src/screens/HistoryScreen.jsx';
import LoginScreen from './src/screens/LoginScreen.jsx';
import MetaScreen from './src/screens/MetaScreen.jsx';
import { DEV_API_BASE_URL, PROD_API_BASE_URL } from './src/config';
import { THEMES } from './src/theme';
import { buildApiUrl } from './src/utils/apiUrl';

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'scan', label: 'Scan' },
  { key: 'history', label: 'Logs' },
  { key: 'goals', label: 'Goals' },
  { key: 'meta', label: 'Meta' },
];
const DEFAULT_HISTORY_THRESHOLDS = {
  highImpactThreshold: 40,
  greenerThreshold: 85,
};
const TOAST_DURATION_MS = 3000;
const EMPTY_HISTORY_STATS = {
  avgScore: null,
  highImpactCount: 0,
  greenerCount: 0,
  ...DEFAULT_HISTORY_THRESHOLDS,
};

function resolveUserId(authUser) {
  if (!authUser) {
    return '';
  }
  if (authUser.email && String(authUser.email).trim()) {
    return String(authUser.email).trim().toLowerCase();
  }
  if (authUser.provider && String(authUser.provider).trim()) {
    return String(authUser.provider).trim().toLowerCase();
  }
  if (authUser.name && String(authUser.name).trim()) {
    return String(authUser.name).trim().toLowerCase().replace(/\s+/g, '-');
  }
  return 'anonymous';
}

function resolveAuthToken(authUser) {
  if (!authUser) {
    return '';
  }
  const token = String(authUser.idToken ?? '').trim();
  return token;
}

function withAuthHeader(headers = {}, authToken = '') {
  const token = String(authToken ?? '').trim();
  if (!token) {
    return headers;
  }
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

function resolveHistoryErrorMessage(error, statusCode, apiMode, apiBaseUrl) {
  const raw = String(error?.message ?? '').trim();
  if (
    raw.includes('Network request failed') ||
    raw.includes('Failed to fetch') ||
    raw.includes('Load failed')
  ) {
    const modeLabel = apiMode === 'development' ? 'Dev' : 'Production';
    return `${modeLabel} backend is unreachable at ${apiBaseUrl}.`;
  }
  if (statusCode === 404) {
    return 'History endpoint is unavailable on this backend (404).';
  }
  if (statusCode === 401 || statusCode === 403) {
    return `History access is denied on this backend (${statusCode}).`;
  }
  if (statusCode >= 500) {
    return `Backend failed while loading history (${statusCode}).`;
  }
  if (raw) {
    return `Could not load history: ${raw}`;
  }
  return 'Could not load history right now.';
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [scanHistory, setScanHistory] = useState([]);
  const [historyStats, setHistoryStats] = useState(EMPTY_HISTORY_STATS);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [goalState, setGoalState] = useState({
    weekKey: getWeekKey(),
    avoidedSingleUseCount: 0,
    currentStreak: 0,
    bestStreak: 0,
  });
  const [apiMode, setApiMode] = useState('production');
  const [devBaseUrl, setDevBaseUrl] = useState(DEV_API_BASE_URL);
  const [authUser, setAuthUser] = useState(null);
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const themeName = colorScheme === 'light' ? 'light' : 'dark';
  const apiBaseUrl = apiMode === 'development' ? devBaseUrl : PROD_API_BASE_URL;
  const userId = resolveUserId(authUser);
  const authToken = resolveAuthToken(authUser);
  const palette = THEMES[themeName] ?? THEMES.dark;
  const styles = createStyles(palette, themeName);
  const toastTimerRef = useRef(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message, type = 'info') => {
    const text = String(message ?? '').trim();
    if (!text) {
      return;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastAnim.stopAnimation();
    toastAnim.setValue(0);
    setToast({ message: text, type, id: Date.now() });
  };

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    Animated.spring(toastAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 250,
      mass: 0.8,
      useNativeDriver: true,
    }).start();

    const toastId = toast.id;
    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }
        setToast((current) => (current && current.id === toastId ? null : current));
      });
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [toast, toastAnim]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const loadHistory = async () => {
    if (!userId || !authToken) {
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    let statusCode = null;
    try {
      const userQuery = `userId=${encodeURIComponent(userId)}`;
      const historyUrl = `${buildApiUrl(apiBaseUrl, '/api/history')}?${userQuery}`;
      const statsUrl = `${buildApiUrl(apiBaseUrl, '/api/history/stats')}?${userQuery}`;
      const historyResponse = await fetch(historyUrl, {
        headers: withAuthHeader({}, authToken),
      });

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        setScanHistory(Array.isArray(historyData) ? historyData : []);
      } else {
        statusCode = historyResponse.status;
        let backendMessage = '';
        try {
          const errorBody = await historyResponse.json();
          backendMessage = String(errorBody?.message ?? '').trim();
        } catch (parseError) {
          backendMessage = '';
        }
        throw new Error(
          backendMessage || `History request failed (${historyResponse.status})`
        );
      }

      try {
        const statsResponse = await fetch(statsUrl, {
          headers: withAuthHeader({}, authToken),
        });
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setHistoryStats({
            avgScore: statsData?.avgScore ?? null,
            highImpactCount: statsData?.highImpactCount ?? 0,
            greenerCount: statsData?.greenerCount ?? 0,
            highImpactThreshold:
              typeof statsData?.highImpactThreshold === 'number'
                ? statsData.highImpactThreshold
                : DEFAULT_HISTORY_THRESHOLDS.highImpactThreshold,
            greenerThreshold:
              typeof statsData?.greenerThreshold === 'number'
                ? statsData.greenerThreshold
                : DEFAULT_HISTORY_THRESHOLDS.greenerThreshold,
          });
        }
      } catch (statsError) {
        // Keep history usable even if stats endpoint is unavailable.
      }
    } catch (error) {
      showToast(resolveHistoryErrorMessage(error, statusCode, apiMode, apiBaseUrl), 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!userId || !authToken) {
      setScanHistory([]);
      setHistoryStats(EMPTY_HISTORY_STATS);
      return;
    }
    // Keep history scoped to the selected backend mode (prod/dev) and user.
    setScanHistory([]);
    setHistoryStats(EMPTY_HISTORY_STATS);
  }, [apiBaseUrl, authToken, userId]);

  useEffect(() => {
    if (activeTab !== 'history' || !userId || !authToken) {
      return;
    }
    loadHistory();
  }, [activeTab, apiBaseUrl, authToken, userId]);

  return (
    <SafeAreaView style={styles.appRoot}>
      <StatusBar style={palette.statusBarStyle} backgroundColor={palette.page} />
      {toast ? (
        <View pointerEvents="none" style={[styles.toastWrap, { top: Math.max(insets.top + 8, 14) }]}>
          <Animated.View
            style={[
              styles.toastCard,
              toast.type === 'error'
                ? styles.toastError
                : toast.type === 'success'
                  ? styles.toastSuccess
                  : styles.toastInfo,
              {
                opacity: toastAnim,
                transform: [
                  {
                    translateY: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-16, 0],
                    }),
                  },
                  {
                    scale: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.toastText}>{toast.message}</Text>
          </Animated.View>
        </View>
      ) : null}
      {!authUser ? (
        <LoginScreen themeName={themeName} onLogin={setAuthUser} showToast={showToast} />
      ) : (
        <>
      <View style={styles.screenWrap}>
        {activeTab === 'home' ? (
          <HomeScreen
            themeName={themeName}
            onStartScan={() => setActiveTab('scan')}
            userName={authUser?.name ?? ''}
          />
        ) : null}
        {activeTab === 'scan' ? (
          <CameraScreen
            setScanHistory={setScanHistory}
            setHistoryStats={setHistoryStats}
            goalState={goalState}
            setGoalState={setGoalState}
            apiMode={apiMode}
            setApiMode={setApiMode}
            devBaseUrl={devBaseUrl}
            setDevBaseUrl={setDevBaseUrl}
            apiBaseUrl={apiBaseUrl}
            userId={userId}
            authToken={authToken}
            themeName={themeName}
            historyThresholds={historyStats}
            showToast={showToast}
          />
        ) : null}
        {activeTab === 'history' ? (
          <HistoryScreen
            scanHistory={scanHistory}
            stats={historyStats}
            themeName={themeName}
            loading={historyLoading}
            onRetry={loadHistory}
          />
        ) : null}
        {activeTab === 'goals' ? <GoalsScreen goalState={goalState} themeName={themeName} /> : null}
        {activeTab === 'meta' ? <MetaScreen themeName={themeName} /> : null}
      </View>

      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabButton, activeTab === tab.key ? styles.tabButtonActive : null]}
          >
            <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
        </View>
      </View>
        </>
      )}
    </SafeAreaView>
  );
}

function createStyles(palette, themeName) {
  return StyleSheet.create({
    appRoot: {
      flex: 1,
      backgroundColor: palette.page,
    },
    toastWrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      zIndex: 50,
      elevation: 10,
      alignItems: 'center',
    },
    toastCard: {
      width: '100%',
      maxWidth: 560,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    toastInfo: {
      backgroundColor: palette.noticeInfoBg,
      borderColor: palette.noticeInfoBorder,
    },
    toastSuccess: {
      backgroundColor: themeName === 'light' ? '#DCFCE7' : 'rgba(34, 197, 94, 0.2)',
      borderColor: themeName === 'light' ? '#86EFAC' : 'rgba(74, 222, 128, 0.35)',
    },
    toastError: {
      backgroundColor: palette.noticeErrorBg,
      borderColor: palette.noticeErrorBorder,
    },
    toastText: {
      color: palette.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 18,
    },
    screenWrap: {
      flex: 1,
      paddingBottom: 72,
      backgroundColor: palette.page,
    },
    tabBarWrap: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 22,
      alignItems: 'center',
    },
    tabBar: {
      flexDirection: 'row',
      gap: 6,
      width: '94%',
      maxWidth: 520,
      paddingHorizontal: 6,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: palette.glassBorder,
      backgroundColor: palette.glassBg,
      minHeight: 56,
      borderRadius: 18,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    tabButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      gap: 2,
    },
    tabButtonActive: {
      backgroundColor: palette.tabActiveBg,
      borderColor: palette.glassBorder,
    },
    tabText: {
      color: palette.tabText,
      fontWeight: '700',
      fontSize: 12,
      letterSpacing: 0.2,
    },
    tabTextActive: {
      color: palette.tabTextActive,
    },
  });
}
