'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Bus,
  CalendarDays,
  Search,
  Settings,
  TicketCheck,
  TrendingUp,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorHandler from '@/components/ui/ErrorHandler';
import PageHeader from '@/components/ui/PageHeader';
import { CardsGridSkeleton, TableSkeleton } from '@/components/ui/SkeletonLoader';
import StatusBadge, { BadgeStatus } from '@/components/ui/StatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { bookingService, reportService, tripService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { useAuth } from '@/core/auth/AuthContext';
import { formatPriceSyp, getDamascusDateYmd } from '@/core/utils/formatters';
import { ArWeb } from '@/i18n/ar';
import {
  BookingDto,
  DashboardReportDto,
  TripStatus,
  TripSummaryDto,
} from '@/types/api.types';

function mapTripBadge(status: TripStatus): BadgeStatus {
  switch (status) {
    case 'OPEN':
      return 'success';
    case 'SCHEDULED':
      return 'info';
    case 'FULL':
    case 'CLOSED':
      return 'warning';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export default function DashboardHomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [kpi, setKpi] = useState<DashboardReportDto | null>(null);
  const [trips, setTrips] = useState<TripSummaryDto[]>([]);
  const [todayBookings, setTodayBookings] = useState<BookingDto[]>([]);
  const [lookupCode, setLookupCode] = useState('');

  const loadOverview = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const todayYmd = getDamascusDateYmd();
      if (user.role === 'ADMIN') {
        const [dash, upcoming] = await Promise.all([
          reportService.getDashboard(),
          tripService.search({ limit: 8, sortBy: 'departAt', sortOrder: 'asc' }),
        ]);
        setKpi(dash);
        setTrips(upcoming.items);
      } else {
        const [todayTrips, recentBookings] = await Promise.all([
          tripService.search({ date: todayYmd, limit: 12, sortBy: 'departAt', sortOrder: 'asc' }),
          bookingService.findAll({ date: todayYmd, limit: 6 }),
        ]);
        setKpi(null);
        setTrips(todayTrips.items);
        setTodayBookings(recentBookings.items);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  function handleQuickLookup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = lookupCode.trim().toUpperCase();
    if (!trimmed) return;
    router.push(`/bookings?code=${encodeURIComponent(trimmed)}`);
  }

  return (
    <AuthGuard>
      <AppLayout>
        <div className="space-y-6">
          <PageHeader
            title={isAdmin ? 'لوحة المؤشرات والعمليات' : 'مكتب الاستقبال والحجز السريع'}
            subtitle={
              isAdmin
                ? `ملخص الأداء التشغيلي اليومي والأسبوعي · ${user?.name ?? ''}`
                : `متابعة رحلات اليوم وإصدار التذاكر الفورية · ${user?.name ?? ''}`
            }
            extraActions={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/trips"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 min-h-[42px]"
                >
                  <Bus className="h-4 w-4" />
                  تصفح الرحلات
                </Link>
                {isAdmin ? (
                  <Link
                    href="/analytics"
                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-fg hover:bg-surface-muted min-h-[42px]"
                  >
                    <BarChart3 className="h-4 w-4" />
                    التقارير المفصلة
                  </Link>
                ) : (
                  <Link
                    href="/bookings"
                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-fg hover:bg-surface-muted min-h-[42px]"
                  >
                    <TicketCheck className="h-4 w-4" />
                    سجل حجوزات اليوم
                  </Link>
                )}
              </div>
            }
          />

          {error ? <ErrorHandler error={error} onRetry={() => void loadOverview()} /> : null}

          {loading ? (
            <div className="space-y-6">
              {isAdmin ? <CardsGridSkeleton count={4} /> : null}
              <TableSkeleton rows={5} />
            </div>
          ) : null}

          {/* Admin KPI Row */}
          {!loading && !error && isAdmin && kpi ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-fg-muted">حجوزات اليوم</p>
                  <p className="mt-2 text-2xl font-extrabold text-fg tabular-nums">
                    {kpi.todayBookingsCount}
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">تذكرة مؤكدة خلال اليوم</p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                  <TicketCheck className="h-6 w-6" />
                </div>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-fg-muted">معدل الإشغال العام</p>
                  <p className="mt-2 text-2xl font-extrabold text-brand-600 tabular-nums">
                    {kpi.occupancyRatePercent}%
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle tabular-nums">
                    {kpi.totalBookedSeats} / {kpi.totalCapacity} مقعد محجوز
                  </p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-50 text-accent-600">
                  <Activity className="h-6 w-6" />
                </div>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-fg-muted">إيرادات الأسبوع المؤكدة</p>
                  <p className="mt-2 text-xl font-extrabold text-emerald-600 tabular-nums">
                    {formatPriceSyp(kpi.weeklyRevenue)}
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">آخر 7 أيام (مؤكد فقط)</p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-fg-muted">الرحلات النشطة</p>
                  <p className="mt-2 text-2xl font-extrabold text-fg tabular-nums">
                    {kpi.activeTripsCount}
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">متاحة أو قيد التشغيل</p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                  <Bus className="h-6 w-6" />
                </div>
              </Card>
            </div>
          ) : null}

          {/* Admin Quick Access Strip */}
          {!loading && !error && isAdmin ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/scheduled-trips"
                className="rounded-2xl border border-line bg-surface p-4 hover:border-brand-600 transition-colors flex items-center gap-3"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-fg">القوالب الدورية</p>
                  <p className="text-xs text-fg-muted">إدارة وتوليد الرحلات اليومية والأسبوعية</p>
                </div>
              </Link>
              <Link
                href="/fleet"
                className="rounded-2xl border border-line bg-surface p-4 hover:border-brand-600 transition-colors flex items-center gap-3"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-50 text-accent-600">
                  <Bus className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-fg">الأسطول والمخططات</p>
                  <p className="text-xs text-fg-muted">فئات الباصات ومعاينة خرائط المقاعد</p>
                </div>
              </Link>
              <Link
                href="/settings"
                className="rounded-2xl border border-line bg-surface p-4 hover:border-brand-600 transition-colors flex items-center gap-3"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-muted text-fg">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-fg">الإعدادات والسياسات</p>
                  <p className="text-xs text-fg-muted">مهل الإلغاء والتثبيت والحد الأقصى للمقاعد</p>
                </div>
              </Link>
            </div>
          ) : null}

          {/* Receptionist Quick Ticket Lookup */}
          {!loading && !error && !isAdmin ? (
            <Card className="p-5">
              <form
                onSubmit={handleQuickLookup}
                className="flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 relative">
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" />
                  <input
                    type="text"
                    value={lookupCode}
                    onChange={(e) => setLookupCode(e.target.value)}
                    placeholder="استعلام سريع برمز التذكرة أو الباركود (مثال: BK-2026-0001)"
                    className="w-full rounded-xl border border-line bg-surface py-2.5 pr-10 pl-4 text-sm text-fg focus:border-brand-600 focus:outline-none"
                  />
                </div>
                <Button type="submit">بحث عن تذكرة</Button>
              </form>
            </Card>
          ) : null}

          {/* Upcoming / Today Trips Table */}
          {!loading && !error ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-fg">
                  {isAdmin ? 'الرحلات القادمة' : 'رحلات اليوم المتاحة للحجز'}
                </h2>
                <Link
                  href="/trips"
                  className="text-sm font-bold text-brand-600 hover:underline"
                >
                  عرض جميع الرحلات ←
                </Link>
              </div>

              {trips.length === 0 ? (
                <EmptyState
                  title="لا توجد رحلات مجدولة حالياً"
                  subtitle="يمكنك استعراض أرشيف الرحلات أو إنشاء رحلة جديدة من إدارة الرحلات."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المسار</TableHead>
                      <TableHead>التاريخ والانطلاق</TableHead>
                      <TableHead>نوع الباص</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>المقاعد المتاحة</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>إجراء سريع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.map((trip) => (
                      <TableRow key={trip.id}>
                        <TableCell className="font-extrabold text-fg">
                          {trip.origin.nameAr} ← {trip.destination.nameAr}
                        </TableCell>
                        <TableCell>
                          <div className="text-fg font-bold">{trip.departDateArabic}</div>
                          <div className="text-xs text-fg-subtle tabular-nums">
                            {trip.departTimeDamascus}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{trip.busType.nameAr}</div>
                          <div className="text-xs text-fg-subtle">
                            {trip.bus?.plateNumber ?? 'باص غير مخصص'}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-brand-600 tabular-nums">
                          {formatPriceSyp(trip.price)}
                        </TableCell>
                        <TableCell className="tabular-nums font-bold text-fg">
                          {trip.availableSeatsCount} / {trip.totalSeats}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={mapTripBadge(trip.status)}
                            label={ArWeb.tripStatus[trip.status]}
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/trips/${trip.id}`}
                            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
                          >
                            خريطة المقاعد والحجز
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}

          {/* Receptionist Recent Bookings Today */}
          {!loading && !error && !isAdmin && todayBookings.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-fg">أحدث حجوزات اليوم</h2>
                <Link
                  href="/bookings"
                  className="text-sm font-bold text-brand-600 hover:underline"
                >
                  عرض السجل الكامل ←
                </Link>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رمز الحجز</TableHead>
                    <TableHead>المسار</TableHead>
                    <TableHead>عدد الركاب</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayBookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-extrabold text-brand-600 tabular-nums">
                        <Link href={`/bookings?code=${encodeURIComponent(b.code)}`}>
                          {b.code}
                        </Link>
                      </TableCell>
                      <TableCell className="font-bold text-fg">
                        {b.trip.origin.nameAr} ← {b.trip.destination.nameAr}
                      </TableCell>
                      <TableCell className="tabular-nums">{b.seats.length}</TableCell>
                      <TableCell className="tabular-nums font-bold text-fg">
                        {formatPriceSyp(b.totalPrice)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={
                            b.status === 'CANCELLED'
                              ? 'danger'
                              : b.status === 'PARTIAL_CANCELLED'
                                ? 'warning'
                                : 'success'
                          }
                          label={ArWeb.bookingStatus[b.status]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      </AppLayout>
    </AuthGuard>
  );
}
