import { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { THEMES } from '../theme';

export default function HomeScreen({ themeName = 'dark' }) {
  const palette = THEMES[themeName] ?? THEMES.dark;
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>EcoLens</Text>
          <Text style={styles.title}>Quick eco decisions while you shop.</Text>
          <Text style={styles.subtitle}>
            Scan an item, get an impact score, and see a better alternative in seconds.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What you can do</Text>
          <Text style={styles.item}>1. Detect products from camera or image.</Text>
          <Text style={styles.item}>2. View score, explanation, and replacement ideas.</Text>
          <Text style={styles.item}>3. Save scan history and track progress.</Text>
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
    heroCard: {
      backgroundColor: palette.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 16,
      gap: 6,
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
      fontSize: 24,
      fontWeight: '800',
      lineHeight: 30,
    },
    subtitle: {
      color: palette.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    card: {
      backgroundColor: palette.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 14,
      gap: 8,
    },
    cardTitle: {
      color: palette.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    item: {
      color: palette.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
