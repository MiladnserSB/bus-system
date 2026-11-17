import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError, profileApi } from '@/shared/api';
import {
  AppButton,
  AppHeader,
  AppInput,
  ErrorBanner,
  ScreenContainer,
  Toast,
} from '@/shared/components';
import { normalizeSyrianPhone, toWesternDigits } from '@/shared/constants/helpers';
import { useCountdown } from '@/shared/hooks/useCountdown';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '@/shared/theme';

export default function ChangePhoneScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [newPhoneDigits, setNewPhoneDigits] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const { secondsLeft, isExpired, start } = useCountdown(60, false);

  const handleRequestOtp = async () => {
    setError(null);
    const normalized = normalizeSyrianPhone(newPhoneDigits);
    if (!normalized) {
      setError(ArStrings.auth.invalidPhoneError);
      return;
    }

    setLoading(true);
    try {
      await profileApi.requestPhoneChangeOtp(normalized);
      setNormalizedPhone(normalized);
      setStep('otp');
      start(60);
      setToast('تم إرسال رمز التحقق إلى الرقم الجديد');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إرسال رمز التحقق حالياً.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanCode = toWesternDigits(otpCode).replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('يرجى إدخال رمز التحقق المكون من 6 أرقام.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await profileApi.verifyPhoneChangeOtp(normalizedPhone, cleanCode);
      setToast('تم تحديث رقم الهاتف بنجاح');
      setTimeout(() => {
        router.back();
      }, 600);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تأكيد الرمز حالياً.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer
      header={<AppHeader title={ArStrings.profile.changePhoneTitle} />}
      footer={
        step === 'phone' ? (
          <AppButton
            title={ArStrings.auth.sendOtpCta}
            onPress={handleRequestOtp}
            loading={loading}
          />
        ) : (
          <AppButton
            title={ArStrings.auth.otpVerifyCta}
            onPress={handleVerifyOtp}
            loading={loading}
          />
        )
      }
    >
      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.card}>
        {step === 'phone' ? (
          <AppInput
            label={ArStrings.profile.newPhoneLabel}
            prefixText="+963"
            placeholder={ArStrings.auth.phonePlaceholder}
            keyboardType="phone-pad"
            value={newPhoneDigits}
            onChangeText={(t) => setNewPhoneDigits(toWesternDigits(t).replace(/[^\d+]/g, ''))}
            hint={ArStrings.auth.phoneHint}
          />
        ) : (
          <View>
            <Text style={styles.sentToText}>
              تم إرسال رمز من 6 أرقام إلى: {normalizedPhone}
            </Text>
            <AppInput
              label="رمز التحقق (6 أرقام)"
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={(t) => setOtpCode(toWesternDigits(t).replace(/\D/g, ''))}
            />
            {isExpired ? (
              <TouchableOpacity onPress={handleRequestOtp} style={styles.resendBtn}>
                <Text style={styles.resendText}>{ArStrings.auth.otpResendReady}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.timerText}>
                {ArStrings.auth.otpResendWait} {secondsLeft} ثانية
              </Text>
            )}
          </View>
        )}
      </View>

      <Toast message={toast} visible={Boolean(toast)} onDismiss={() => setToast('')} type="success" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  sentToText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.primary,
    textAlign: 'right',
    marginBottom: Spacing.md,
  },
  resendBtn: {
    minHeight: TouchTargets.minSize,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  resendText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.sm,
    color: Colors.primary,
  },
  timerText: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
