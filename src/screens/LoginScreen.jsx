import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEMES } from '../theme';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';

function GoogleSignInButton({ styles, palette, onLogin, showToast }) {
  if (Platform.OS === 'ios' && !GOOGLE_IOS_CLIENT_ID) {
    return (
      <Pressable disabled style={[styles.googleButton, styles.googleButtonDisabled]}>
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      </Pressable>
    );
  }

  if (Platform.OS === 'android' && !GOOGLE_ANDROID_CLIENT_ID) {
    return (
      <Pressable disabled style={[styles.googleButton, styles.googleButtonDisabled]}>
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      </Pressable>
    );
  }

  const googleConfig = {
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    expoClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    scopes: ['openid', 'profile', 'email'],
  };

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [request, response, promptAsync] = Google.useAuthRequest(googleConfig);

  useEffect(() => {
    const loadProfile = async () => {
      if (response?.type !== 'success') {
        if (response?.type === 'error') {
          showToast('Google sign-in failed. Please try again.', 'error');
        }
        return;
      }

      const accessToken = response.authentication?.accessToken;
      const idToken = response.authentication?.idToken;
      if (!accessToken) {
        showToast('Google sign-in did not return an access token.', 'error');
        return;
      }
      if (!idToken) {
        showToast('Google sign-in did not return an ID token.', 'error');
        return;
      }

      if (__DEV__) {
        console.log('[AuthDebug] GOOGLE_ID_TOKEN', idToken);
      }

      setLoadingProfile(true);
      try {
        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!profileResponse.ok) {
          throw new Error(`Failed to load profile (${profileResponse.status})`);
        }

        const profile = await profileResponse.json();
        onLogin({
          name: profile?.name ?? 'EcoLens User',
          email: profile?.email ?? '',
          picture: profile?.picture ?? '',
          idToken,
          accessToken,
          provider: 'google',
        });
      } catch (error) {
        showToast(
          error.message ? `Google profile failed: ${error.message}` : 'Google profile failed.',
          'error'
        );
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [onLogin, response, showToast]);

  return (
    <Pressable
      disabled={!request || loadingProfile}
      style={({ pressed }) => [
        styles.googleButton,
        (!request || loadingProfile) ? styles.googleButtonDisabled : null,
        pressed ? styles.googleButtonPressed : null,
      ]}
      onPress={() => {
        promptAsync();
      }}
    >
      {loadingProfile ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={palette.actionText} />
          <Text style={styles.googleButtonText}>Signing in...</Text>
        </View>
      ) : (
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      )}
    </Pressable>
  );
}

export default function LoginScreen({ themeName = 'dark', onLogin = () => {}, showToast = () => {} }) {
  const palette = THEMES[themeName] ?? THEMES.dark;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const isExpoGo = Constants.appOwnership === 'expo';

  const hasGoogleClientIds = Platform.OS === 'ios'
    ? Boolean(GOOGLE_IOS_CLIENT_ID)
    : Platform.OS === 'android'
      ? Boolean(GOOGLE_ANDROID_CLIENT_ID)
      : Boolean(GOOGLE_WEB_CLIENT_ID);
  const canUseGoogleAuth = !isExpoGo && hasGoogleClientIds;
  const missingClientIdHint = Platform.OS === 'ios'
    ? 'Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID for iOS.'
    : Platform.OS === 'android'
      ? 'Set EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID for Android.'
      : 'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID for web.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>EcoLens</Text>
          <Text style={styles.title}>Sign in to sync your eco journey.</Text>
          <Text style={styles.subtitle}>Use Google to continue and keep your scan history connected.</Text>
        </View>

        <View style={styles.actionsCard}>
          {canUseGoogleAuth ? (
            <GoogleSignInButton
              styles={styles}
              palette={palette}
              onLogin={onLogin}
              showToast={showToast}
            />
          ) : (
            <>
              <Pressable disabled style={[styles.googleButton, styles.googleButtonDisabled]}>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </Pressable>
              <Text style={styles.hint}>
                {isExpoGo
                  ? 'Google sign-in is disabled in Expo Go. Use a development build to test OAuth.'
                  : missingClientIdHint}
              </Text>
            </>
          )}
          <Pressable
            style={styles.secondaryButton}
            onPress={() => onLogin({ name: 'Guest User', provider: 'guest', idToken: '' })}
          >
            <Text style={styles.secondaryButtonText}>Continue as Guest</Text>
          </Pressable>
        </View>
      </View>
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
      flex: 1,
      padding: 16,
      justifyContent: 'center',
      gap: 12,
    },
    heroCard: {
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
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
    actionsCard: {
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      padding: 14,
      gap: 10,
    },
    googleButton: {
      minHeight: 50,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.action,
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleButtonDisabled: { opacity: 0.55 },
    googleButtonPressed: {
      opacity: 0.9,
    },
    googleButtonText: {
      color: palette.actionText,
      fontWeight: '800',
      fontSize: 16,
    },
    secondaryButton: {
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.input,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: palette.textPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    hint: {
      color: palette.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
