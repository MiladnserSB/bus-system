export type StaffRole = 'ADMIN' | 'RECEPTIONIST';
export type UserRole = StaffRole | 'CUSTOMER';

export interface AuthUser {
  id: number;
  name: string;
  username: string | null;
  email: string | null;
  phone: string;
  role: UserRole;
  isActive?: boolean;
  mustChangePassword: boolean;
  lockedUntil?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: AuthUser;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorPayload {
  code?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
}

export interface CityDto {
  id: number;
  nameAr: string;
  nameEn: string | null;
  isActive: boolean;
  createdAt?: string;
}

export type BusCategory = 'STANDARD' | 'FIRST_CLASS' | 'BUSINESS';
export type BusSize = 'MEDIUM' | 'LARGE';
export type SeatSide = 'LEFT' | 'MIDDLE' | 'RIGHT';
export type SeatStatus = 'AVAILABLE' | 'BOOKED' | 'HELD' | 'HELD_BY_ME';

export interface SeatTemplateDto {
  id?: number;
  busTypeId?: number;
  seatNumber: string;
  rowNumber: number;
  colLetter: string;
  side: SeatSide;
  colIndex: number;
  isExtra: boolean;
}

export interface BusTypeDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
  category: BusCategory;
  size: BusSize;
  layout: string;
  rowsCount: number;
  hasExtraBackSeat: boolean;
  totalSeats: number;
  isActive: boolean;
}

export interface BusTypeLayoutResponse {
  busType: BusTypeDto;
  totalSeats: number;
  seats: SeatTemplateDto[];
}

export interface BusDto {
  id: number;
  plateNumber: string;
  busTypeId: number;
  isActive: boolean;
  busType: BusTypeDto;
}

export type TripStatus =
  | 'SCHEDULED'
  | 'OPEN'
  | 'FULL'
  | 'CLOSED'
  | 'DEPARTED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface TripSummaryDto {
  id: number;
  templateId: number | null;
  origin: { id: number; nameAr: string; nameEn: string | null };
  destination: { id: number; nameAr: string; nameEn: string | null };
  busType: {
    id: number;
    code?: string;
    nameAr: string;
    category: BusCategory;
    size: BusSize;
    layout: string;
    totalSeats: number;
  };
  bus: { id: number; plateNumber: string } | null;
  departAt: string;
  departDateDamascus: string;
  departTimeDamascus: string;
  departDateArabic: string;
  price: number;
  status: TripStatus;
  totalSeats: number;
  bookedSeatsCount: number;
  availableSeatsCount: number;
  cancelReason: string | null;
  cancelledAt: string | null;
}

export interface TripDetailDto extends TripSummaryDto {
  bookingClosesAt: string;
}

export interface TripsListResponse {
  items: TripSummaryDto[];
  suggestedDates: string[];
  meta: PaginationMeta;
}

export interface SeatDto extends SeatTemplateDto {
  status: SeatStatus;
  holdExpiresAt?: string;
}

export interface SeatMapResponse {
  tripId: number;
  status: TripStatus;
  price: number;
  busType: {
    id: number;
    nameAr: string;
    category: BusCategory;
    size: BusSize;
    layout: string;
    rowsCount: number;
    hasExtraBackSeat: boolean;
    totalSeats: number;
  };
  seats: SeatDto[];
}

export interface TripManifestPassengerDto {
  seatNumber: string;
  passengerName: string;
  passengerPhone: string;
  status: BookingStatus;
  bookingCode: string;
  paymentMethod: PaymentMethod;
  channel: BookingChannel;
}

export interface TripManifestResponse {
  trip: TripSummaryDto;
  passengers: TripManifestPassengerDto[];
}

export type RecurrenceType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface TemplateExclusionDto {
  id: number;
  excludedDate: string;
  reason: string | null;
}

export interface TripTemplateDto {
  id: number;
  origin: { id: number; nameAr: string; nameEn: string | null };
  destination: { id: number; nameAr: string; nameEn: string | null };
  busType: BusTypeDto;
  bus: { id: number; plateNumber: string } | null;
  price: number;
  departureTime: string;
  recurrence: RecurrenceType;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  generateAheadDays: number;
  isActive: boolean;
  upcomingTripsCount: number;
  exclusions: TemplateExclusionDto[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePreviewResponse {
  count: number;
  items: {
    date: string;
    time: string;
    dayNameAr: string;
    departAt: string;
  }[];
}

export interface HoldResponse {
  holdId: string;
  tripId: number;
  seatNumbers: string[];
  ttlSeconds: number;
  expiresAt: string;
}

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'PARTIAL_CANCELLED';
export type PaymentMethod = 'CASH_ON_BOARDING' | 'CASH_OFFICE';
export type BookingChannel = 'MOBILE_APP' | 'WEB_GUEST' | 'RECEPTIONIST';

export interface BookingSeatDto {
  id: number;
  seatNumber: string;
  passengerName: string;
  passengerPhone: string;
  unitPrice: number;
  status: BookingStatus;
  isActive: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface BookingDto {
  id: number;
  code: string;
  tripId: number;
  userId: number | null;
  channel: BookingChannel;
  contactName: string | null;
  contactPhone: string | null;
  unitPrice: number;
  totalPrice: number;
  paymentMethod: PaymentMethod;
  status: BookingStatus;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  createdBy: { id: number; name: string; role: UserRole } | null;
  trip: {
    id: number;
    status: TripStatus;
    departAt: string;
    departDateDamascus: string;
    departTimeDamascus: string;
    departDateArabic: string;
    origin: { id: number; nameAr: string; nameEn: string | null };
    destination: { id: number; nameAr: string; nameEn: string | null };
    busType: { id: number; nameAr: string; category: string; layout: string };
    bus: { id: number; plateNumber: string } | null;
  };
  seats: BookingSeatDto[];
}

export interface BookingsListResponse {
  items: BookingDto[];
  meta: PaginationMeta;
}

export interface TicketSeatDto {
  seatNumber: string;
  passengerName: string;
  passengerPhone: string;
  unitPrice: number;
  status: BookingStatus;
  isActive: boolean;
}

export interface TicketDto {
  bookingCode: string;
  status: BookingStatus;
  route: {
    originAr: string;
    originEn: string | null;
    destinationAr: string;
    destinationEn: string | null;
    label: string;
  };
  departAt: string;
  departDateDamascus: string;
  departTimeDamascus: string;
  departDateArabic: string;
  busType: {
    nameAr: string;
    category: string;
    size: string;
    layout: string;
  };
  busPlateNumber: string | null;
  seats: TicketSeatDto[];
  totalPrice: number;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  earlyArrivalNotice: string;
  qrPayload: {
    code: string;
    tripId: number;
    seats: string[];
    issuedAt: string;
    signature: string;
  };
  qrCodeDataUrl: string;
}

export interface CreateBookingResponse {
  booking: BookingDto;
  ticket: TicketDto;
  idempotentReplay: boolean;
}

export interface DashboardReportDto {
  todayBookingsCount: number;
  occupancyRatePercent: number;
  weeklyRevenue: number;
  activeTripsCount: number;
  totalCapacity: number;
  totalBookedSeats: number;
}

export interface OccupancyReportRow {
  originId: number;
  destinationId: number;
  route: string;
  tripsCount: number;
  totalCapacity: number;
  bookedSeats: number;
  occupancyPercent: number;
}

export interface RevenueReportRow {
  route: string;
  busType: string;
  bookingsCount: number;
  seatsSold: number;
  revenue: number;
}

export interface RevenueReportResponse {
  totalRevenue: number;
  totalSeatsSold: number;
  items: RevenueReportRow[];
}

export interface TopRouteReportRow {
  route: string;
  bookingsCount: number;
  seatsSold: number;
  revenue: number;
}

export interface StaffReportRow {
  userId: number;
  name: string;
  username: string | null;
  role: UserRole;
  bookingsCreated: number;
  cancellationsProcessed: number;
}

export interface AuditLogDto {
  id: number;
  userId: number | null;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
  user: {
    id: number;
    name: string;
    username: string | null;
    role: UserRole;
  } | null;
}

export interface AuditLogsResponse {
  items: AuditLogDto[];
  meta: PaginationMeta;
}

export interface PolicySettingsDto {
  cancellationDeadlineHours: number;
  bookingCutoffMinutes: number;
  maxSeatsPerBooking: number;
  seatHoldTtlMinutes: number;
  templateGenerateAheadDays: number;
  tripAutoCompleteHours: number;
  reminderHoursBefore: number[];
}

export interface SettingRowDto {
  key: string;
  value: string;
  description: string | null;
  updatedAt?: string;
}

export interface SettingsResponse {
  policy: PolicySettingsDto;
  items: SettingRowDto[];
}
