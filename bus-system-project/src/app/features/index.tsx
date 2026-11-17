import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FcmService, profileApi, SecureStorage } from '@/shared/api';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing } from '@/shared/theme';

export default function FeaturesEntryScreen() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const bootstrapSession = async () => {
      try {
        const token = await SecureStorage.getAccessToken();
        if (token) {
          // Validate or refresh session silently on launch and register device push token
          await profileApi.getMe().catch(() => null);
          await FcmService.registerDevice();
        }
      } finally {
        if (active) {
          router.replace('/features/(tabs)' as Href);
        }
      }
    };

    void bootstrapSession();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <View style={styles.logoBox}>
        <Ionicons name="bus" size={44} color={Colors.accent} />
      </View>
      <Text style={styles.brandName}>{ArStrings.app.brandName}</Text>
      <Text style={styles.tagline}>{ArStrings.app.brandTagline}</Text>
      <ActivityIndicator size="large" color={Colors.accent} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: Radii.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  brandName: {
    fontFamily: FontFamilies.extraBold,
    fontSize: 34,
    color: Colors.textLight,
    marginBottom: 4,
  },
  tagline: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.md,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  loader: {
    marginTop: Spacing.md,
  },
});
