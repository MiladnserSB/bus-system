export type UserRole = 'ADMIN' | 'RECEPTIONIST' | 'CUSTOMER';

export interface AuthUser {
  id: number;
  name: string;
  username?: string | null;
  email?: string | null;
  phone: string | null;
  role: UserRole;
  isActive?: boolean;
  mustChangePassword?: boolean;
  consentAccepted?: boolean;
  consentAt?: string | null;
  createdAt?: string;
}

export interface RequestOtpResponse {
  sent: boolean;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  message: string;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: AuthUser;
}

export interface CityDto {
  id: number;
  nameAr: string;
  nameEn: string | null;
  isActive: boolean;
}

export type BusCategory = 'STANDARD' | 'FIRST_CLASS' | 'BUSINESS';
export type BusSize = 'MEDIUM' | 'LARGE';

export interface BusTypeDto {
  id: number;
  code?: string;
  nameAr: string;
  nameEn?: string | null;
  category: BusCategory;
  size: BusSize;
  layout: string; // e.g. '2+2', '2+1', '1+1'
  rowsCount?: number;
  hasExtraBackSeat?: boolean;
  totalSeats: number;
  isActive?: boolean;
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

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TripsListResponse {
  items: TripSummaryDto[];
  suggestedDates: string[];
  meta: PaginationMeta;
}

export type SeatStatus = 'AVAILABLE' | 'BOOKED' | 'HELD' | 'HELD_BY_ME';
export type SeatSide = 'LEFT' | 'MIDDLE' | 'RIGHT';

export interface SeatDto {
  seatNumber: string;
  rowNumber: number;
  colLetter: string;
  side: SeatSide;
  colIndex: number;
  isExtra: boolean;
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

export interface HoldResponse {
  holdId: string;
  tripId: number;
  seatNumbers: string[];
  ttlSeconds: number;
  expiresAt: string;
  guestSessionId?: string;
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
  guestAccessToken?: string;
}

export type NotificationType =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'TRIP_CANCELLED'
  | 'TRIP_TIME_CHANGED'
  | 'TRIP_REMINDER';

export interface NotificationDto {
  id: number;
  userId: number;
  bookingId: number | null;
  tripId: number | null;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsListResponse {
  items: NotificationDto[];
  unreadCount: number;
  meta: PaginationMeta;
}

export interface NotificationPreferencesDto {
  userId?: number;
  remindersEnabled: boolean;
  nonCriticalEnabled: boolean;
}

export interface ApiErrorPayload {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

export interface StoredGuestBookingRef {
  bookingCode: string;
  guestAccessToken: string;
  createdAt: string;
}
