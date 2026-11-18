import {
  AuthTokensResponse,
  AuthUser,
  BookingDto,
  BusTypeDto,
  CityDto,
  CreateBookingResponse,
  HoldResponse,
  NotificationPreferencesDto,
  NotificationsListResponse,
  PaymentMethod,
  RequestOtpResponse,
  SeatMapResponse,
  TicketDto,
  TripDetailDto,
  TripsListResponse,
} from '../types/api.types';
import { type ApiRequestOptions } from './clientCore';

export interface HttpClientLike {
  get: <T>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) => Promise<T>;
  post: <T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ) => Promise<T>;
  patch: <T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ) => Promise<T>;
  put: <T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ) => Promise<T>;
  delete: <T>(endpoint: string, options?: Omit<ApiRequestOptions, 'method'>) => Promise<T>;
}

export interface SearchTripsParams {
  originId?: number;
  destinationId?: number;
  date?: string;
  busTypeId?: number;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'departAt' | 'price';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ApiStorageAdapter {
  saveAuthSession: (params: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }) => Promise<void>;
  saveUser: (user: AuthUser) => Promise<void>;
  getRefreshToken: () => Promise<string | null>;
  getFcmToken: () => Promise<string | null>;
  clearAuthSession: () => Promise<void>;
  getOrCreateGuestSessionId: () => Promise<string>;
  saveGuestBookingRef: (bookingCode: string, guestAccessToken: string) => Promise<void>;
  getGuestTokenForBooking: (bookingCode: string) => Promise<string | null>;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      sp.append(k, String(v));
    }
  }
  const str = sp.toString();
  return str ? `?${str}` : '';
}

export function createServices(client: HttpClientLike, storage: ApiStorageAdapter) {
  const persistAuthSession = async (res: AuthTokensResponse) => {
    await storage.saveAuthSession({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    });
    return res;
  };

  const authApi = {
    requestOtp(phone: string): Promise<RequestOtpResponse> {
      return client.post('/auth/otp/request', { phone }, { skipAuth: true });
    },

    async verifyOtp(params: {
      phone: string;
      code: string;
      name?: string;
      consentAccepted?: boolean;
    }): Promise<AuthTokensResponse> {
      const res = await client.post<AuthTokensResponse>(
        '/auth/otp/verify',
        params,
        { skipAuth: true },
      );
      return persistAuthSession(res);
    },

    async phoneLogin(params: {
      phone: string;
      name?: string;
      consentAccepted?: boolean;
    }): Promise<AuthTokensResponse> {
      const res = await client.post<AuthTokensResponse>(
        '/auth/phone-login',
        params,
        { skipAuth: true },
      );
      return persistAuthSession(res);
    },

    async logout(): Promise<void> {
      const [refreshToken, fcmToken] = await Promise.all([
        storage.getRefreshToken(),
        storage.getFcmToken(),
      ]);
      try {
        await client.post(
          '/auth/logout',
          { refreshToken: refreshToken ?? undefined, fcmToken: fcmToken ?? undefined },
          { skipAuthRetry: true },
        );
      } catch {
        // Clear local session regardless of network outcome on logout
      } finally {
        await storage.clearAuthSession();
      }
    },
  };

  const profileApi = {
    async getMe(): Promise<AuthUser> {
      const user = await client.get<AuthUser>('/me');
      await storage.saveUser(user);
      return user;
    },

    async updateName(name: string): Promise<AuthUser> {
      const user = await client.patch<AuthUser>('/me', { name });
      await storage.saveUser(user);
      return user;
    },

    requestPhoneChangeOtp(newPhone: string): Promise<{
      sent: boolean;
      expiresInSeconds: number;
      message: string;
    }> {
      return client.post('/me/phone/request-otp', { newPhone });
    },

    async verifyPhoneChangeOtp(newPhone: string, code: string): Promise<AuthUser> {
      const user = await client.post<AuthUser>('/me/phone/verify', { newPhone, code });
      await storage.saveUser(user);
      return user;
    },
  };

  const catalogApi = {
    getCities(): Promise<CityDto[]> {
      return client.get<CityDto[]>('/cities');
    },

    getBusTypes(): Promise<BusTypeDto[]> {
      return client.get<BusTypeDto[]>('/bus-types');
    },
  };

  const tripsApi = {
    searchTrips(params: SearchTripsParams): Promise<TripsListResponse> {
      return client.get<TripsListResponse>(`/trips${buildQuery({ ...params })}`);
    },

    getTrip(id: number): Promise<TripDetailDto> {
      return client.get<TripDetailDto>(`/trips/${id}`);
    },

    async getSeatMap(id: number): Promise<SeatMapResponse> {
      const guestSession = await storage.getOrCreateGuestSessionId();
      return client.get<SeatMapResponse>(`/trips/${id}/seats`, {
        headers: { 'x-guest-session': guestSession },
      });
    },
  };

  const holdsApi = {
    async createHold(tripId: number, seatNumbers: string[]): Promise<HoldResponse> {
      const guestSession = await storage.getOrCreateGuestSessionId();
      return client.post<HoldResponse>(
        `/trips/${tripId}/holds`,
        { seatNumbers, guestSessionId: guestSession },
        { headers: { 'x-guest-session': guestSession } },
      );
    },

    async releaseHold(holdId: string): Promise<{ released: boolean }> {
      const guestSession = await storage.getOrCreateGuestSessionId();
      return client.delete<{ released: boolean }>(`/holds/${holdId}`, {
        headers: { 'x-guest-session': guestSession },
      });
    },
  };

  const bookingsApi = {
    async createBooking(
      payload: {
        tripId: number;
        passengers: {
          seatNumber: string;
          passengerName: string;
          passengerPhone: string;
        }[];
        holdId?: string;
        contactName?: string;
        contactPhone?: string;
        paymentMethod?: PaymentMethod;
      },
      idempotencyKey: string,
    ): Promise<CreateBookingResponse> {
      const guestSession = await storage.getOrCreateGuestSessionId();
      const res = await client.post<CreateBookingResponse>(
        '/bookings',
        {
          ...payload,
          guestSessionId: guestSession,
          idempotencyKey,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
            'x-guest-session': guestSession,
          },
        },
      );

      if (res.guestAccessToken && res.booking?.code) {
        await storage.saveGuestBookingRef(res.booking.code, res.guestAccessToken);
      }
      return res;
    },

    getMyBookings(
      tab: 'upcoming' | 'past' | 'cancelled' | 'all' = 'all',
    ): Promise<BookingDto[]> {
      return client.get<BookingDto[]>(`/me/bookings${buildQuery({ tab })}`);
    },

    async getBookingByCode(code: string, explicitGuestToken?: string): Promise<BookingDto> {
      const guestToken =
        explicitGuestToken ?? (await storage.getGuestTokenForBooking(code));
      return client.get<BookingDto>(`/bookings/${encodeURIComponent(code)}`, {
        headers: guestToken ? { 'x-guest-token': guestToken } : undefined,
      });
    },

    updatePassengers(
      code: string,
      passengers: {
        seatNumber: string;
        passengerName?: string;
        passengerPhone?: string;
      }[],
    ): Promise<BookingDto> {
      return client.patch<BookingDto>(
        `/bookings/${encodeURIComponent(code)}/passengers`,
        { passengers },
      );
    },

    async cancelBooking(
      code: string,
      reason?: string,
      explicitGuestToken?: string,
    ): Promise<BookingDto> {
      const guestToken =
        explicitGuestToken ?? (await storage.getGuestTokenForBooking(code));
      return client.post<BookingDto>(
        `/bookings/${encodeURIComponent(code)}/cancel`,
        { reason },
        {
          headers: guestToken ? { 'x-guest-token': guestToken } : undefined,
        },
      );
    },

    async cancelSeat(
      code: string,
      seatNumber: string,
      reason?: string,
      explicitGuestToken?: string,
    ): Promise<BookingDto> {
      const guestToken =
        explicitGuestToken ?? (await storage.getGuestTokenForBooking(code));
      return client.post<BookingDto>(
        `/bookings/${encodeURIComponent(code)}/seats/${encodeURIComponent(seatNumber)}/cancel`,
        { reason },
        {
          headers: guestToken ? { 'x-guest-token': guestToken } : undefined,
        },
      );
    },
  };

  const ticketsApi = {
    async getTicket(code: string, explicitGuestToken?: string): Promise<TicketDto> {
      const guestToken =
        explicitGuestToken ?? (await storage.getGuestTokenForBooking(code));
      return client.get<TicketDto>(`/bookings/${encodeURIComponent(code)}/ticket`, {
        headers: guestToken ? { 'x-guest-token': guestToken } : undefined,
      });
    },
  };

  const notificationsApi = {
    getNotifications(page = 1, limit = 20): Promise<NotificationsListResponse> {
      return client.get<NotificationsListResponse>(
        `/notifications${buildQuery({ page, limit })}`,
      );
    },

    markAsRead(id: number): Promise<{ id: number; isRead: boolean }> {
      return client.patch(`/notifications/${id}/read`, {});
    },

    markAllAsRead(): Promise<{ updatedCount: number }> {
      return client.patch('/notifications/read-all', {});
    },

    getPreferences(): Promise<NotificationPreferencesDto> {
      return client.get<NotificationPreferencesDto>('/notifications/preferences');
    },

    updatePreferences(
      dto: Partial<NotificationPreferencesDto>,
    ): Promise<NotificationPreferencesDto> {
      return client.patch<NotificationPreferencesDto>('/notifications/preferences', dto);
    },
  };

  const devicesApi = {
    registerDevice(
      fcmToken: string,
      platform: 'ANDROID' | 'IOS' | 'WEB',
    ): Promise<unknown> {
      return client.post('/devices', { fcmToken, platform });
    },

    unregisterDevice(fcmToken: string): Promise<unknown> {
      return client.delete(`/devices/${encodeURIComponent(fcmToken)}`);
    },
  };

  return {
    authApi,
    profileApi,
    catalogApi,
    tripsApi,
    holdsApi,
    bookingsApi,
    ticketsApi,
    notificationsApi,
    devicesApi,
  };
}
