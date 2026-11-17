import React from 'react';
import { AppHeader, ScreenContainer, TripListSkeleton } from '@/shared/components';
import { ArStrings } from '@/shared/i18n/ar';

export default function TripsLoadingScreen() {
  return (
    <ScreenContainer header={<AppHeader title={ArStrings.trips.resultsTitle} />}>
      <TripListSkeleton count={4} />
    </ScreenContainer>
  );
}
