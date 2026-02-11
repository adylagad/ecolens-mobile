import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { API_BASE_URL } from '../config';

const LABEL_OPTIONS = [
  'Single-use Plastic Bottle',
  'Paper Coffee Cup',
  'LED Light Bulb',
];

export default function CameraScreen() {
  const [selectedLabel, setSelectedLabel] = useState(LABEL_OPTIONS[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/recognize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          detectedLabel: selectedLabel,
          confidence: 0.9,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }
      setResult(data);
    } catch (fetchError) {
      setError(fetchError.message || 'Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Manual Label Demo</Text>

        <Text style={styles.label}>Select label</Text>
        <Pressable
          onPress={() => setIsDropdownOpen((prev) => !prev)}
          style={styles.dropdownTrigger}
        >
          <Text>{selectedLabel}</Text>
          <Text style={styles.caret}>{isDropdownOpen ? '▲' : '▼'}</Text>
        </Pressable>

        {isDropdownOpen ? (
          <View style={styles.dropdownList}>
            {LABEL_OPTIONS.map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  setSelectedLabel(option);
                  setIsDropdownOpen(false);
                }}
                style={styles.dropdownItem}
              >
                <Text>{option}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={handleAnalyze}
          disabled={loading}
          style={({ pressed }) => [
            styles.analyzeButton,
            pressed && !loading ? styles.analyzeButtonPressed : null,
            loading ? styles.analyzeButtonDisabled : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.analyzeButtonText}>Analyze</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {result ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{result.title || 'Result'}</Text>
            <Text style={styles.resultItem}>ecoScore: {String(result.ecoScore ?? '-')}</Text>
            <Text style={styles.resultItem}>co2Gram: {String(result.co2Gram ?? '-')}</Text>
            <Text style={styles.resultItem}>
              suggestion: {String(result.suggestion ?? '-')}
            </Text>
            <Text style={styles.resultItem}>
              explanation: {String(result.explanation ?? '-')}
            </Text>
            <Text style={styles.resultItem}>
              confidence: {String(result.confidence ?? '-')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  label: {
    fontSize: 14,
    color: '#444',
  },
  dropdownTrigger: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caret: {
    color: '#666',
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  dropdownItem: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  analyzeButton: {
    minHeight: 56,
    backgroundColor: '#1f7a4d',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeButtonPressed: {
    opacity: 0.9,
  },
  analyzeButtonDisabled: {
    opacity: 0.75,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  errorText: {
    color: '#b00020',
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 6,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  resultItem: {
    fontSize: 14,
    color: '#222',
  },
});
