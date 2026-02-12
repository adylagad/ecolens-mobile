import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import CameraScreen from './src/screens/CameraScreen.jsx';
import GoalsScreen from './src/screens/GoalsScreen.jsx';
import HistoryScreen from './src/screens/HistoryScreen.jsx';

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
  const [goalState, setGoalState] = useState({
    weekKey: getWeekKey(),
    avoidedSingleUseCount: 0,
    currentStreak: 0,
    bestStreak: 0,
  });

  return (
    <View style={styles.appRoot}>
      <View style={styles.screenWrap}>
        {activeTab === 'scan' ? (
          <CameraScreen
            scanHistory={scanHistory}
            setScanHistory={setScanHistory}
            goalState={goalState}
            setGoalState={setGoalState}
          />
        ) : null}
        {activeTab === 'history' ? <HistoryScreen scanHistory={scanHistory} /> : null}
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
    </View>
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
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#25324A',
    backgroundColor: '#0B1221',
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
