import React from 'react';
import { useRouter, type Href } from 'expo-router';
import { ErrorFallback } from '@/shared/components/ErrorFallback';

export default function FeaturesNotFoundScreen() {
  const router = useRouter();

  return (
    <ErrorFallback
      title="عذراً، الصفحة غير موجودة"
      message="الرابط أو الصفحة التي تحاول الوصول إليها غير متوفرة حالياً."
      actionText="العودة إلى الرئيسية"
      onAction={() => router.replace('/features/(tabs)' as Href)}
      iconName="help-circle-outline"
    />
  );
}
