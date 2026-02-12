import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const GOAL_TARGET = 5;

export default function GoalsScreen({ goalState }) {
  const safeGoalState =
    goalState ||
    ({
      weekKey: 'N/A',
      avoidedSingleUseCount: 0,
      currentStreak: 0,
      bestStreak: 0,
    });

  const progress = Math.min((safeGoalState.avoidedSingleUseCount || 0) / GOAL_TARGET, 1);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Goals & Streaks</Text>
          <Text style={styles.hint}>Week {safeGoalState.weekKey}</Text>

          <Text style={styles.goalText}>Avoid 5 single-use items this week.</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Progress</Text>
              <Text style={styles.metricValue}>
                {safeGoalState.avoidedSingleUseCount}/{GOAL_TARGET}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Current streak</Text>
              <Text style={styles.metricValue}>{safeGoalState.currentStreak}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Best streak</Text>
              <Text style={styles.metricValue}>{safeGoalState.bestStreak}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.subtitle}>Tips</Text>
          <Text style={styles.tip}>1. Carry a reusable bottle and cup daily.</Text>
          <Text style={styles.tip}>2. Save every scan to see patterns over time.</Text>
          <Text style={styles.tip}>3. If confidence is low, confirm label to improve outcomes.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07111F',
  },
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#25324A',
    padding: 14,
    gap: 10,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  hint: {
    color: '#94A3B8',
    fontSize: 12,
  },
  goalText: {
    color: '#E2E8F0',
    fontSize: 14,
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#25324A',
    backgroundColor: '#0A1425',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#16A34A',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#25324A',
    backgroundColor: '#131F34',
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  tip: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
  },
});
