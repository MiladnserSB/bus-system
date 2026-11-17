import {
  AuditLogDto,
  AuditLogsResponse,
  AuthTokensResponse,
  AuthUser,
  BookingDto,
  BookingsListResponse,
  BusCategory,
  BusDto,
  BusSize,
  BusTypeDto,
  BusTypeLayoutResponse,
  CityDto,
  CreateBookingResponse,
  DashboardReportDto,
  HoldResponse,
  OccupancyReportRow,
  PaymentMethod,
  PolicySettingsDto,
  RecurrenceType,
  RevenueReportResponse,
  SeatMapResponse,
  SettingsResponse,
  StaffReportRow,
  StaffRole,
  TemplatePreviewResponse,
  TicketDto,
  TopRouteReportRow,
  TripDetailDto,
  TripManifestResponse,
  TripsListResponse,
  TripStatus,
  TripTemplateDto,
} from '@/types/api.types';
import { type WebRequestOptions } from './clientCore';

export interface WebHttpClient {
  get: <T>(endpoint: string, options?: Omit<WebRequestOptions, 'method' | 'body'>) => Promise<T>;
  post: <T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<WebRequestOptions, 'method' | 'body'>,
  ) => Promise<T>;
  patch: <T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<WebRequestOptions, 'method' | 'body'>,
  ) => Promise<T>;
  put: <T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<WebRequestOptions, 'method' | 'body'>,
  ) => Promise<T>;
  delete: <T>(endpoint: string, options?: Omit<WebRequestOptions, 'method'>) => Promise<T>;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim().length > 0) {
      sp.append(k, String(v));
    }
  }
  const str = sp.toString();
  return str ? `?${str}` : '';
}

export function createWebServices(client: WebHttpClient) {
  const authService = {
    login(identifier: string, password: string): Promise<AuthTokensResponse> {
      return client.post<AuthTokensResponse>(
        '/auth/login',
        { identifier, password },
        { skipAuth: true },
      );
    },

    logout(refreshToken?: string | null): Promise<{ loggedOut: boolean }> {
      return client.post<{ loggedOut: boolean }>(
        '/auth/logout',
        { refreshToken: refreshToken ?? undefined },
        { skipAuthRetry: true },
      );
    },

    changePassword(
      currentPassword: string,
      newPassword: string,
    ): Promise<{ changed: boolean }> {
      return client.post<{ changed: boolean }>('/auth/change-password', {
        currentPassword,
        newPassword,
      });
    },
  };

  const profileService = {
    getMe(): Promise<AuthUser> {
      return client.get<AuthUser>('/me');
    },

    updateName(name: string): Promise<AuthUser> {
      return client.patch<AuthUser>('/me', { name });
    },
  };

  const cityService = {
    getAll(includeInactive = true): Promise<CityDto[]> {
      return client.get<CityDto[]>(`/cities${buildQuery({ includeInactive })}`);
    },

    create(dto: { nameAr: string; nameEn?: string; isActive?: boolean }): Promise<CityDto> {
      return client.post<CityDto>('/cities', dto);
    },

    update(
      id: number,
      dto: { nameAr?: string; nameEn?: string; isActive?: boolean },
    ): Promise<CityDto> {
      return client.patch<CityDto>(`/cities/${id}`, dto);
    },

    remove(id: number): Promise<{ deleted: boolean; id: number }> {
      return client.delete<{ deleted: boolean; id: number }>(`/cities/${id}`);
    },
  };

  const busTypeService = {
    getAll(includeInactive = true): Promise<BusTypeDto[]> {
      return client.get<BusTypeDto[]>(`/bus-types${buildQuery({ includeInactive })}`);
    },

    getLayout(id: number): Promise<BusTypeLayoutResponse> {
      return client.get<BusTypeLayoutResponse>(`/bus-types/${id}/layout`);
    },

    create(dto: {
      code: string;
      nameAr: string;
      nameEn?: string;
      category: BusCategory;
      size: BusSize;
      layout: string;
      rowsCount: number;
      hasExtraBackSeat?: boolean;
      totalSeats?: number;
    }): Promise<BusTypeDto> {
      return client.post<BusTypeDto>('/bus-types', dto);
    },

    update(
      id: number,
      dto: { nameAr?: string; nameEn?: string; isActive?: boolean },
    ): Promise<BusTypeDto> {
      return client.patch<BusTypeDto>(`/bus-types/${id}`, dto);
    },

    remove(id: number): Promise<{ deleted: boolean; id: number }> {
      return client.delete<{ deleted: boolean; id: number }>(`/bus-types/${id}`);
    },
  };

  const busService = {
    getAll(params?: { includeInactive?: boolean; busTypeId?: number }): Promise<BusDto[]> {
      return client.get<BusDto[]>(`/buses${buildQuery({ includeInactive: params?.includeInactive ?? true, busTypeId: params?.busTypeId })}`);
    },

    create(dto: { plateNumber: string; busTypeId: number; isActive?: boolean }): Promise<BusDto> {
      return client.post<BusDto>('/buses', dto);
    },

    update(
      id: number,
      dto: { plateNumber?: string; busTypeId?: number; isActive?: boolean },
    ): Promise<BusDto> {
      return client.patch<BusDto>(`/buses/${id}`, dto);
    },

    remove(id: number): Promise<{ deleted: boolean; id: number }> {
      return client.delete<{ deleted: boolean; id: number }>(`/buses/${id}`);
    },
  };

  const tripService = {
    search(params: {
      originId?: number;
      destinationId?: number;
      date?: string;
      busTypeId?: number;
      status?: TripStatus;
      minPrice?: number;
      maxPrice?: number;
      includePast?: boolean;
      sortBy?: 'departAt' | 'price';
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }): Promise<TripsListResponse> {
      return client.get<TripsListResponse>(`/trips${buildQuery({ ...params })}`);
    },

    getById(id: number): Promise<TripDetailDto> {
      return client.get<TripDetailDto>(`/trips/${id}`);
    },

    getSeats(id: number): Promise<SeatMapResponse> {
      return client.get<SeatMapResponse>(`/trips/${id}/seats`);
    },

    getManifest(id: number): Promise<TripManifestResponse> {
      return client.get<TripManifestResponse>(`/trips/${id}/manifest`);
    },

    create(dto: {
      originId: number;
      destinationId: number;
      busTypeId: number;
      busId?: number;
      price: number;
      departDate: string;
      departTime: string;
      status?: TripStatus;
      confirmDuplicate?: boolean;
    }): Promise<TripDetailDto> {
      return client.post<TripDetailDto>('/trips', dto);
    },

    update(
      id: number,
      dto: {
        originId?: number;
        destinationId?: number;
        busTypeId?: number;
        busId?: number;
        price?: number;
        departDate?: string;
        departTime?: string;
        status?: TripStatus;
      },
    ): Promise<TripDetailDto> {
      return client.patch<TripDetailDto>(`/trips/${id}`, dto);
    },

    cancel(id: number, reason?: string): Promise<TripDetailDto> {
      return client.post<TripDetailDto>(`/trips/${id}/cancel`, { reason });
    },
  };

  const templateService = {
    getAll(): Promise<TripTemplateDto[]> {
      return client.get<TripTemplateDto[]>('/trip-templates');
    },

    preview(dto: {
      originId: number;
      destinationId: number;
      busTypeId: number;
      busId?: number;
      price: number;
      departureTime: string;
      recurrence: RecurrenceType;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      startDate: string;
      endDate?: string | null;
      generateAheadDays?: number;
      exclusionDates?: string[];
    }): Promise<TemplatePreviewResponse> {
      return client.post<TemplatePreviewResponse>('/trip-templates/preview', dto);
    },

    create(dto: {
      originId: number;
      destinationId: number;
      busTypeId: number;
      busId?: number;
      price: number;
      departureTime: string;
      recurrence: RecurrenceType;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      startDate: string;
      endDate?: string | null;
      generateAheadDays?: number;
      exclusionDates?: string[];
    }): Promise<TripTemplateDto> {
      return client.post<TripTemplateDto>('/trip-templates', dto);
    },

    update(
      id: number,
      dto: {
        price?: number;
        departureTime?: string;
        recurrence?: RecurrenceType;
        daysOfWeek?: number[];
        dayOfMonth?: number;
        endDate?: string | null;
        busId?: number;
      },
    ): Promise<TripTemplateDto> {
      return client.patch<TripTemplateDto>(`/trip-templates/${id}`, dto);
    },

    toggle(id: number): Promise<TripTemplateDto> {
      return client.post<TripTemplateDto>(`/trip-templates/${id}/toggle`, {});
    },

    remove(id: number): Promise<{ deleted: boolean; id: number; deletedUnbookedFutureTrips?: number }> {
      return client.delete(`/trip-templates/${id}`);
    },

    generateAll(): Promise<{ processedTemplates: number; createdTrips: number }> {
      return client.post('/trip-templates/generate', {});
    },

    addExclusion(
      id: number,
      excludedDate: string,
      reason?: string,
    ): Promise<{ id: number; templateId: number; excludedDate: string; reason: string | null }> {
      return client.post(`/trip-templates/${id}/exclusions`, { excludedDate, reason });
    },

    removeExclusion(id: number, exclusionId: number): Promise<{ removed: boolean }> {
      return client.delete(`/trip-templates/${id}/exclusions/${exclusionId}`);
    },
  };

  const holdService = {
    createHold(tripId: number, seatNumbers: string[]): Promise<HoldResponse> {
      return client.post<HoldResponse>(`/trips/${tripId}/holds`, { seatNumbers });
    },

    releaseHold(holdId: string): Promise<{ released: boolean }> {
      return client.delete<{ released: boolean }>(`/holds/${holdId}`);
    },
  };

  const bookingService = {
    findAll(params: {
      code?: string;
      phone?: string;
      tripId?: number;
      date?: string;
      status?: BookingDto['status'];
      page?: number;
      limit?: number;
    }): Promise<BookingsListResponse> {
      return client.get<BookingsListResponse>(`/bookings${buildQuery({ ...params })}`);
    },

    getByCode(code: string): Promise<BookingDto> {
      return client.get<BookingDto>(`/bookings/${encodeURIComponent(code)}`);
    },

    getTicket(code: string): Promise<TicketDto> {
      return client.get<TicketDto>(`/bookings/${encodeURIComponent(code)}/ticket`);
    },

    create(
      payload: {
        tripId: number;
        passengers: { seatNumber: string; passengerName: string; passengerPhone: string }[];
        holdId?: string;
        contactName?: string;
        contactPhone?: string;
        paymentMethod?: PaymentMethod;
      },
      idempotencyKey: string,
    ): Promise<CreateBookingResponse> {
      return client.post<CreateBookingResponse>(
        '/bookings',
        { ...payload, idempotencyKey },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
    },

    updatePassengers(
      code: string,
      passengers: { seatNumber: string; passengerName?: string; passengerPhone?: string }[],
    ): Promise<BookingDto> {
      return client.patch<BookingDto>(
        `/bookings/${encodeURIComponent(code)}/passengers`,
        { passengers },
      );
    },

    cancel(code: string, reason?: string): Promise<BookingDto> {
      return client.post<BookingDto>(`/bookings/${encodeURIComponent(code)}/cancel`, { reason });
    },

    cancelSeat(code: string, seatNumber: string, reason?: string): Promise<BookingDto> {
      return client.post<BookingDto>(
        `/bookings/${encodeURIComponent(code)}/seats/${encodeURIComponent(seatNumber)}/cancel`,
        { reason },
      );
    },
  };

  const userService = {
    getAll(params?: { role?: StaffRole; isActive?: boolean; search?: string }): Promise<AuthUser[]> {
      return client.get<AuthUser[]>(`/users${buildQuery({ ...params })}`);
    },

    create(dto: {
      name: string;
      username: string;
      email?: string;
      phone: string;
      password: string;
      role?: StaffRole;
    }): Promise<AuthUser> {
      return client.post<AuthUser>('/users', dto);
    },

    update(
      id: number,
      dto: {
        name?: string;
        username?: string;
        email?: string;
        phone?: string;
        role?: StaffRole;
      },
    ): Promise<AuthUser> {
      return client.patch<AuthUser>(`/users/${id}`, dto);
    },

    updateStatus(id: number, isActive: boolean): Promise<AuthUser> {
      return client.patch<AuthUser>(`/users/${id}/status`, { isActive });
    },

    resetPassword(id: number, temporaryPassword: string): Promise<{ reset: boolean }> {
      return client.post<{ reset: boolean }>(`/users/${id}/reset-password`, {
        temporaryPassword,
      });
    },
  };

  const reportService = {
    getDashboard(): Promise<DashboardReportDto> {
      return client.get<DashboardReportDto>('/reports/dashboard');
    },

    getOccupancy(params?: { from?: string; to?: string }): Promise<{ items: OccupancyReportRow[] }> {
      return client.get<{ items: OccupancyReportRow[] }>(
        `/reports/occupancy${buildQuery({ ...params })}`,
      );
    },

    getRevenue(params?: { from?: string; to?: string }): Promise<RevenueReportResponse> {
      return client.get<RevenueReportResponse>(`/reports/revenue${buildQuery({ ...params })}`);
    },

    getTopRoutes(params?: { from?: string; to?: string }): Promise<{ items: TopRouteReportRow[] }> {
      return client.get<{ items: TopRouteReportRow[] }>(
        `/reports/top-routes${buildQuery({ ...params })}`,
      );
    },

    getStaff(params?: { from?: string; to?: string }): Promise<{ items: StaffReportRow[] }> {
      return client.get<{ items: StaffReportRow[] }>(`/reports/staff${buildQuery({ ...params })}`);
    },

    exportFile(
      report: 'occupancy' | 'revenue' | 'top-routes' | 'staff',
      format: 'csv' | 'pdf',
      params?: { from?: string; to?: string },
    ): Promise<Blob> {
      return client.get<Blob>(
        `/reports/${report}${buildQuery({ ...params, format })}`,
        { responseType: 'blob' },
      );
    },
  };

  const auditLogService = {
    findAll(params?: {
      userId?: number;
      action?: string;
      entity?: string;
      entityId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }): Promise<AuditLogsResponse> {
      return client.get<AuditLogsResponse>(`/audit-logs${buildQuery({ ...params })}`);
    },

    findOne(id: number): Promise<AuditLogDto> {
      return client.get<AuditLogDto>(`/audit-logs/${id}`);
    },
  };

  const settingsService = {
    get(): Promise<SettingsResponse> {
      return client.get<SettingsResponse>('/settings');
    },

    update(dto: Partial<{
      cancellationDeadlineHours: number;
      bookingCutoffMinutes: number;
      maxSeatsPerBooking: number;
      seatHoldTtlMinutes: number;
      templateGenerateAheadDays: number;
      tripAutoCompleteHours: number;
      reminderHoursBefore: string;
    }>): Promise<PolicySettingsDto> {
      return client.patch<PolicySettingsDto>('/settings', dto);
    },
  };

  return {
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
  };
}
