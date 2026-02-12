import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import CameraScreen from './src/screens/CameraScreen.jsx';
import GoalsScreen from './src/screens/GoalsScreen.jsx';
import HistoryScreen from './src/screens/HistoryScreen.jsx';
import { DEV_API_BASE_URL, PROD_API_BASE_URL } from './src/config';
import { THEMES } from './src/theme';

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

const TABS = [
  { key: 'scan', label: 'Scan' },
  { key: 'history', label: 'History' },
  { key: 'goals', label: 'Goals' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('scan');
  const [scanHistory, setScanHistory] = useState([]);
  const [historyStats, setHistoryStats] = useState({ avgScore: null, highImpactCount: 0, greenerCount: 0 });
  const [goalState, setGoalState] = useState({
    weekKey: getWeekKey(),
    avoidedSingleUseCount: 0,
    currentStreak: 0,
    bestStreak: 0,
  });
  const [apiMode, setApiMode] = useState('production');
  const [devBaseUrl, setDevBaseUrl] = useState(DEV_API_BASE_URL);
  const [themeName, setThemeName] = useState('dark');
  const apiBaseUrl = apiMode === 'development' ? devBaseUrl : PROD_API_BASE_URL;
  const palette = THEMES[themeName] ?? THEMES.dark;
  const styles = createStyles(palette);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const [historyResponse, statsResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/history`),
          fetch(`${apiBaseUrl}/api/history/stats`),
        ]);

        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          setScanHistory(Array.isArray(historyData) ? historyData : []);
        }

        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setHistoryStats({
            avgScore: statsData?.avgScore ?? null,
            highImpactCount: statsData?.highImpactCount ?? 0,
            greenerCount: statsData?.greenerCount ?? 0,
          });
        }
      } catch (error) {
        // Keep local state as fallback when backend is unreachable.
      }
    };

    loadHistory();
  }, [apiBaseUrl]);

  return (
    <SafeAreaView style={styles.appRoot}>
      <StatusBar style={palette.statusBarStyle} backgroundColor={palette.page} />
      <View style={styles.screenWrap}>
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
            themeName={themeName}
            setThemeName={setThemeName}
          />
        ) : null}
        {activeTab === 'history' ? (
          <HistoryScreen scanHistory={scanHistory} stats={historyStats} themeName={themeName} />
        ) : null}
        {activeTab === 'goals' ? <GoalsScreen goalState={goalState} themeName={themeName} /> : null}
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
    </SafeAreaView>
  );
}

function createStyles(palette) {
  return StyleSheet.create({
    appRoot: {
      flex: 1,
      backgroundColor: palette.page,
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
      width: '88%',
      maxWidth: 420,
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
