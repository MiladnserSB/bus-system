import React, { useRef, useState } from 'react';
import { I18nManager, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ApiError, authApi, FcmService } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  ErrorBanner,
  ScreenContainer,
  Toast,
} from '@/shared/components';
import { toWesternDigits } from '@/shared/constants/helpers';
import { useCountdown } from '@/shared/hooks/useCountdown';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '@/shared/theme';

const OTP_LENGTH = 6;

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { phone, name, resendAfter } = useLocalSearchParams<{
    phone: string;
    name?: string;
    resendAfter?: string;
  }>();

  const initialTimer = Number.parseInt(resendAfter ?? '60', 10) || 60;
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const inputRefs = useRef<(React.ComponentRef<typeof TextInput> | null)[]>([]);
  const { secondsLeft, formattedTime, isExpired, start } = useCountdown(initialTimer, true);

  const codeValue = digits.join('');

  const handleDigitChange = (index: number, raw: string) => {
    const clean = toWesternDigits(raw).replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      setError(null);
      return;
    }

    // Handle pasting full 6-digit OTP code
    if (clean.length > 1) {
      const chars = clean.slice(0, OTP_LENGTH).split('');
      const next = Array(OTP_LENGTH)
        .fill('')
        .map((_, idx) => chars[idx] ?? '');
      setDigits(next);
      setError(null);
      const focusIdx = Math.min(chars.length - 1, OTP_LENGTH - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    setError(null);

    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (codeValue.length !== OTP_LENGTH) {
      setError('يرجى إدخال رمز التحقق المكوّن من 6 أرقام.');
      return;
    }
    if (!phone) {
      router.replace('/features/(auth)' as Href);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await authApi.verifyOtp({
        phone,
        code: codeValue,
        name: name?.trim() || undefined,
        consentAccepted: true,
      });
      await FcmService.registerDevice();
      router.replace('/features/(tabs)' as Href);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'تعذر التحقق من الرمز حالياً. أعد المحاولة.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isExpired || !phone) return;
    setError(null);
    try {
      const res = await authApi.requestOtp(phone);
      start(res.resendAfterSeconds ?? 60);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      setToast('تم إرسال رمز تحقق جديد إلى هاتفك');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إعادة إرسال الرمز حالياً.');
    }
  };

  return (
    <ScreenContainer
      header={<AppHeader title={ArStrings.auth.otpTitle} />}
      footer={
        <AppButton
          title={ArStrings.auth.otpVerifyCta}
          onPress={handleVerify}
          loading={loading}
          disabled={codeValue.length !== OTP_LENGTH}
        />
      }
    >
      <View style={styles.intro}>
        <Text style={styles.subtitle}>{ArStrings.auth.otpSubtitle}</Text>
        <Text style={styles.phoneText}>{phone ?? ''}</Text>
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.otpContainer}>
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            value={digit}
            onChangeText={(val) => handleDigitChange(index, val)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            textAlign="center"
            accessibilityLabel={`الرقم ${index + 1} من رمز التحقق`}
          />
        ))}
      </View>

      <View style={styles.resendWrap}>
        {isExpired ? (
          <TouchableOpacity
            onPress={handleResend}
            style={styles.resendBtn}
            accessibilityRole="button"
          >
            <Text style={styles.resendBtnText}>{ArStrings.auth.otpResendReady}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.countdownText}>
            {ArStrings.auth.otpResendWait} {formattedTime} ({secondsLeft} ثانية)
          </Text>
        )}
      </View>

      <Toast message={toast} visible={Boolean(toast)} onDismiss={() => setToast('')} type="info" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: {
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  subtitle: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  phoneText: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.primary,
    marginTop: Spacing.xs,
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
  },
  otpContainer: {
    flexDirection: Platform.OS === 'web' || I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  otpBox: {
    flex: 1,
    minWidth: TouchTargets.minSize,
    height: 56,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.xl,
    color: Colors.textMain,
    fontVariant: ['tabular-nums'],
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  resendWrap: {
    alignItems: 'center',
  },
  resendBtn: {
    minHeight: TouchTargets.minSize,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    borderRadius: Radii.md,
    backgroundColor: Colors.primaryLight,
  },
  resendBtnText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.primary,
  },
  countdownText: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
