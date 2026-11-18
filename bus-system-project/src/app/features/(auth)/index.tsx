import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, authApi, FcmService } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  AppInput,
  ErrorBanner,
  ScreenContainer,
} from '@/shared/components';
import { normalizeSyrianPhone, toWesternDigits } from '@/shared/constants/helpers';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '@/shared/theme';

export default function AuthPhoneScreen() {
  const router = useRouter();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [name, setName] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [fieldError, setFieldError] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePhoneChange = (text: string) => {
    const cleaned = toWesternDigits(text).replace(/[^\d+]/g, '');
    setPhoneDigits(cleaned);
    if (fieldError) setFieldError('');
    if (apiError) setApiError(null);
  };

  const handlePhoneLogin = async () => {
    setApiError(null);
    const normalized = normalizeSyrianPhone(phoneDigits);
    if (!normalized) {
      setFieldError(ArStrings.auth.invalidPhoneError);
      return;
    }
    if (!consentAccepted) {
      setApiError(ArStrings.auth.consentRequiredError);
      return;
    }

    setLoading(true);
    try {
      await authApi.phoneLogin({
        phone: normalized,
        name: name.trim() || undefined,
        consentAccepted: true,
      });
      await FcmService.registerDevice();
      router.replace('/features/(tabs)' as Href);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? err.message : 'تعذر تسجيل الدخول حالياً. أعد المحاولة.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer
      header={
        <AppHeader
          title={ArStrings.auth.loginTitle}
          subtitle={ArStrings.app.brandName}
          showBack
        />
      }
      footer={
        <View style={styles.footerStack}>
          <AppButton
            title={ArStrings.auth.phoneLoginCta}
            onPress={handlePhoneLogin}
            loading={loading}
            variant="primary"
          />
          <TouchableOpacity
            onPress={() => router.replace('/features/(tabs)' as Href)}
            style={styles.guestBtn}
            accessibilityRole="button"
          >
            <Text style={styles.guestBtnText}>{ArStrings.auth.continueAsGuest}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/features/(tabs)/profile/privacy' as Href)}
            style={styles.privacyLinkBtn}
            accessibilityRole="button"
          >
            <Text style={styles.privacyLinkText}>{ArStrings.profile.privacyRow}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.brandBanner}>
        <View style={styles.iconCircle}>
          <Ionicons name="bus" size={32} color={Colors.primary} />
        </View>
        <Text style={styles.heroTitle}>{ArStrings.auth.loginTitle}</Text>
        <Text style={styles.heroSub}>{ArStrings.auth.loginSubtitle}</Text>
      </View>

      {apiError ? <ErrorBanner message={apiError} /> : null}

      <View style={styles.card}>
        <AppInput
          label={ArStrings.auth.phoneLabel}
          prefixText="+963"
          placeholder={ArStrings.auth.phonePlaceholder}
          keyboardType="phone-pad"
          value={phoneDigits}
          onChangeText={handlePhoneChange}
          maxLength={14}
          error={fieldError}
          hint={ArStrings.auth.phoneHint}
        />

        <AppInput
          label={ArStrings.auth.nameLabel}
          placeholder={ArStrings.auth.namePlaceholder}
          value={name}
          onChangeText={setName}
          maxLength={100}
        />

        <TouchableOpacity
          onPress={() => setConsentAccepted((prev) => !prev)}
          style={styles.consentRow}
          activeOpacity={0.75}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentAccepted }}
        >
          <View style={[styles.checkbox, consentAccepted ? styles.checkboxChecked : null]}>
            {consentAccepted ? (
              <Ionicons name="checkmark" size={16} color={Colors.textLight} />
            ) : null}
          </View>
          <Text style={styles.consentText}>{ArStrings.auth.consentText}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.noteBox}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
        <Text style={styles.noteText}>{ArStrings.auth.guestNote}</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  brandBanner: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: Radii.xl,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: '#C7D7F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  heroTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xxl,
    color: Colors.textMain,
    marginBottom: 4,
  },
  heroSub: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    minHeight: TouchTargets.minSize,
    paddingTop: Spacing.xs,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  consentText: {
    flex: 1,
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 20,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  noteText: {
    flex: 1,
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.primaryDark,
    textAlign: 'right',
    lineHeight: 19,
  },
  footerStack: {
    gap: Spacing.xs,
  },
  guestBtn: {
    minHeight: TouchTargets.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestBtnText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  privacyLinkBtn: {
    minHeight: TouchTargets.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyLinkText: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
});
