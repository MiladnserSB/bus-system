import React from 'react';
import { useRouter, type Href } from 'expo-router';
import { ErrorFallback } from '@/shared/components/ErrorFallback';

export default function RootNotFoundScreen() {
  const router = useRouter();

  return (
    <ErrorFallback
      title="الصفحة غير موجودة"
      message="لم نتمكن من العثور على المسار المطلوب في التطبيق."
      actionText="العودة إلى الرئيسية"
      onAction={() => router.replace('/features/(tabs)' as Href)}
      iconName="compass-outline"
    />
  );
}
