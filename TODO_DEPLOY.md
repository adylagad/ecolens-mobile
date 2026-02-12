## TODO Before Production Release

- Re-enable and verify Google login in a development/production build (not Expo Go).
- Confirm Google OAuth client IDs are set in production environment variables:
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
  - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
  - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- Verify Google Console settings:
  - Correct OAuth consent screen configuration and app status.
  - Correct redirect URIs / package / bundle identifiers for final app.
