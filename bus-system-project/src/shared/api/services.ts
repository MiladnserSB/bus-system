import { apiClient } from './client';
import { SecureStorage } from './secureStore';
import { createServices } from './servicesCore';

export {
  createServices,
  type ApiStorageAdapter,
  type HttpClientLike,
  type SearchTripsParams,
} from './servicesCore';

export const {
  authApi,
  profileApi,
  catalogApi,
  tripsApi,
  holdsApi,
  bookingsApi,
  ticketsApi,
  notificationsApi,
  devicesApi,
} = createServices(apiClient, SecureStorage);
