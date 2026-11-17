import { apiClient } from './client';
import { createWebServices } from './servicesCore';

export { createWebServices, type WebHttpClient } from './servicesCore';

export const {
  authService,
  profileService,
  cityService,
  busTypeService,
  busService,
  tripService,
  templateService,
  holdService,
  bookingService,
  userService,
  reportService,
  auditLogService,
  settingsService,
} = createWebServices(apiClient);
