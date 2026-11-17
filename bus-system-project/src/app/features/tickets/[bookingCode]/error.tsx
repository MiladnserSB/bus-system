import React from 'react';
import { useRouter, type Href } from 'expo-router';
import { ErrorFallback } from '@/shared/components';

export default function TicketErrorScreen() {
  const router = useRouter();

  return (
    <ErrorFallback
      title="تعذر عرض التذكرة"
      message="تحقق من رقم الحجز أو اتصال الإنترنت وحاول مرة أخرى."
      actionText="العودة إلى حجوزاتي"
      onAction={() => router.replace('/features/(tabs)/my-bookings' as Href)}
      iconName="ticket-outline"
    />
  );
}
