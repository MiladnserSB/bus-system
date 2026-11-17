import React from 'react';
import { AppHeader, ScreenContainer, SeatMapSkeleton } from '@/shared/components';
import { ArStrings } from '@/shared/i18n/ar';

export default function TripSeatLoadingScreen() {
  return (
    <ScreenContainer header={<AppHeader title={ArStrings.seats.screenTitle} />}>
      <SeatMapSkeleton />
    </ScreenContainer>
  );
}
