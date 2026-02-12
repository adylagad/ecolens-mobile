import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function HistoryScreen({ scanHistory = [] }) {
  const [highImpactOnly, setHighImpactOnly] = useState(false);

  const visibleHistory = useMemo(
    () => (highImpactOnly ? scanHistory.filter((entry) => entry.ecoScore < 40) : scanHistory),
    [highImpactOnly, scanHistory]
  );

  const stats = useMemo(() => {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>History Timeline</Text>
            <Pressable
              style={[styles.filterPill, highImpactOnly ? styles.filterPillActive : null]}
              onPress={() => setHighImpactOnly((prev) => !prev)}
            >
              <Text style={[styles.filterPillText, highImpactOnly ? styles.filterPillTextActive : null]}>
                {highImpactOnly ? 'High impact only: ON' : 'High impact only: OFF'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>Track scans and monitor progress over time.</Text>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg score</Text>
              <Text style={styles.statValue}>{stats.avgScore === null ? '-' : stats.avgScore.toFixed(1)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>High impact</Text>
              <Text style={styles.statValue}>{stats.highImpactCount}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Greener picks</Text>
              <Text style={styles.statValue}>{stats.greenerCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          {!visibleHistory.length ? (
            <Text style={styles.emptyText}>No saved scans yet. Go to Scan and tap Save after a result.</Text>
          ) : (
            <View style={styles.list}>
              {visibleHistory.map((entry) => (
                <View key={entry.id} style={styles.item}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemTitle}>{entry.item}</Text>
                    <Text style={styles.itemScore}>Score {entry.ecoScore}</Text>
                  </View>
                  <Text style={styles.itemMeta}>
                    {entry.category} • {new Date(entry.timestamp).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  hint: {
    color: '#94A3B8',
    fontSize: 13,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: '#25324A',
    backgroundColor: '#0A1425',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: 'center',
  },
  filterPillActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  filterPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#7F1D1D',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#25324A',
    backgroundColor: '#131F34',
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  statValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  list: {
    gap: 8,
  },
  item: {
    borderWidth: 1,
    borderColor: '#25324A',
    backgroundColor: '#131F34',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    color: '#F8FAFC',
    fontWeight: '700',
    flex: 1,
  },
  itemScore: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 12,
  },
  itemMeta: {
    color: '#94A3B8',
    fontSize: 12,
  },
});
