import React from 'react';
import { useRouter } from 'expo-router';
import { ErrorFallback } from '@/shared/components';

export default function TripSeatErrorScreen() {
  const router = useRouter();

  return (
    <ErrorFallback
      title="تعذر تحميل خريطة المقاعد"
      message="حدث خطأ أثناء تحميل مقاعد الرحلة. يرجى المحاولة مرة أخرى."
      actionText="العودة لقائمة الرحلات"
      onAction={() => router.back()}
      iconName="grid-outline"
    />
  );
}
