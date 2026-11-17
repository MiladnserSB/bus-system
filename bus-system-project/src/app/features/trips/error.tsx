import React from 'react';
import { useRouter, type Href } from 'expo-router';
import { ErrorFallback } from '@/shared/components';

export default function TripsErrorScreen() {
  const router = useRouter();

  return (
    <ErrorFallback
      title="تعذر تحميل الرحلات"
      message="حدث خطأ أثناء جلب قائمة الرحلات أو انتهت مهلة الاتصال بالخادم. يرجى إعادة المحاولة."
      actionText="إعادة المحاولة"
      onAction={() => router.replace('/features/(tabs)' as Href)}
      iconName="bus-outline"
    />
  );
}
