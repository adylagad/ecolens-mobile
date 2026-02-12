import { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { THEMES } from '../theme';

export default function MetaScreen({ themeName = 'dark' }) {
  const palette = THEMES[themeName] ?? THEMES.dark;
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Meta Glasses</Text>
          <Text style={styles.title}>Connect with Meta Glasses</Text>
          <Text style={styles.subtitle}>
            This feature is releasing soon. You will be able to run hands-free EcoLens scans from wearables.
          </Text>
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
      padding: 16,
      gap: 8,
    },
    kicker: {
      color: '#38BDF8',
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    title: {
      color: palette.textPrimary,
      fontSize: 22,
      fontWeight: '800',
      lineHeight: 28,
    },
    subtitle: {
      color: palette.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
