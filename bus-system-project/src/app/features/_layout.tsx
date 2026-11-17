import React from 'react';
import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ErrorFallback } from '@/shared/components/ErrorFallback';
import { ensureRTL } from '@/shared/constants/rtl';

ensureRTL();

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();

  return (
    <ErrorFallback
      title="تعذر عرض هذه الشاشة"
      message={error?.message || 'حدث خطأ أثناء تحميل الشاشة. يرجى المحاولة مرة أخرى.'}
      actionText="إعادة المحاولة"
      onAction={retry}
      secondaryActionText="العودة للرئيسية"
      onSecondaryAction={() => router.replace('/features/(tabs)' as Href)}
    />
  );
}

export default function FeaturesRootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_left' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trips" />
        <Stack.Screen name="tickets" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
