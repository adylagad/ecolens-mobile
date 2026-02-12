import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { THEMES } from '../theme';

export default function HistoryScreen({
  scanHistory = [],
  stats = null,
  themeName = 'dark',
  loading = false,
  error = '',
  onRetry = () => {},
}) {
  const [highImpactOnly, setHighImpactOnly] = useState(false);
  const palette = THEMES[themeName] ?? THEMES.dark;
  const styles = useMemo(() => createStyles(palette), [palette]);

  const visibleHistory = useMemo(
    () => (highImpactOnly ? scanHistory.filter((entry) => entry.ecoScore < 40) : scanHistory),
    [highImpactOnly, scanHistory]
  );

  const localStats = useMemo(() => {
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

  const resolvedStats = {
    avgScore: stats?.avgScore ?? localStats.avgScore,
    highImpactCount: stats?.highImpactCount ?? localStats.highImpactCount,
    greenerCount: stats?.greenerCount ?? localStats.greenerCount,
  };

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
              <Text style={styles.statValue}>
                {resolvedStats.avgScore === null ? '-' : resolvedStats.avgScore.toFixed(1)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>High impact</Text>
              <Text style={styles.statValue}>{resolvedStats.highImpactCount}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Greener picks</Text>
              <Text style={styles.statValue}>{resolvedStats.greenerCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#0EA5E9" />
              <Text style={styles.emptyText}>Loading your scan history...</Text>
            </View>
          ) : error ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={onRetry}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : !visibleHistory.length ? (
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

function createStyles(palette) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.page,
    },
    container: {
      padding: 16,
      gap: 12,
      paddingBottom: 24,
    },
    card: {
      backgroundColor: palette.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
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
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  hint: {
    color: palette.textSecondary,
    fontSize: 13,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
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
    color: palette.textSecondary,
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
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  statLabel: {
    color: palette.textSecondary,
    fontSize: 11,
  },
  statValue: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: palette.textSecondary,
    fontSize: 13,
  },
  loadingWrap: {
    gap: 10,
    alignItems: 'flex-start',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  retryButtonText: {
    color: palette.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  list: {
    gap: 8,
  },
  item: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
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
    color: palette.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  itemScore: {
    color: palette.textPrimary,
    fontWeight: '800',
    fontSize: 12,
  },
  itemMeta: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  });
}
