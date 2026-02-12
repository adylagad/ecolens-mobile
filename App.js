import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import CameraScreen from './src/screens/CameraScreen.jsx';
import GoalsScreen from './src/screens/GoalsScreen.jsx';
import HistoryScreen from './src/screens/HistoryScreen.jsx';
import { DEV_API_BASE_URL, PROD_API_BASE_URL } from './src/config';

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
  const apiBaseUrl = apiMode === 'development' ? devBaseUrl : PROD_API_BASE_URL;

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
          />
        ) : null}
        {activeTab === 'history' ? <HistoryScreen scanHistory={scanHistory} stats={historyStats} /> : null}
        {activeTab === 'goals' ? <GoalsScreen goalState={goalState} /> : null}
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#07111F',
  },
  screenWrap: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: '#25324A',
    backgroundColor: '#0B1221',
    minHeight: 74,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#25324A',
    backgroundColor: '#0A1425',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#0EA5E9',
    borderColor: '#0EA5E9',
  },
  tabText: {
    color: '#94A3B8',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#082F49',
  },
});
