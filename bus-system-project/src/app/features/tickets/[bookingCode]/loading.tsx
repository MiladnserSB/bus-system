import React from 'react';
import { AppHeader, ScreenContainer, TicketSkeleton } from '@/shared/components';
import { ArStrings } from '@/shared/i18n/ar';

export default function TicketLoadingScreen() {
  return (
    <ScreenContainer header={<AppHeader title={ArStrings.ticket.screenTitle} />}>
      <TicketSkeleton />
    </ScreenContainer>
  );
}
