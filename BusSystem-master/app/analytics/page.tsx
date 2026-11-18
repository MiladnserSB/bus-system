'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorHandler from '@/components/ui/ErrorHandler';
import PageHeader from '@/components/ui/PageHeader';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import StatusBadge from '@/components/ui/StatusBadge';
import TabComponent from '@/components/ui/TabComponent';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { useToast } from '@/components/ui/ToastProvider';
import { WebApiError } from '@/core/api/client';
import { reportService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { RoleGuard } from '@/core/auth/RoleGuard';
import { formatPriceSyp, getDamascusDateYmd } from '@/core/utils/formatters';
import { ArWeb } from '@/i18n/ar';
import {
  OccupancyReportRow,
  RevenueReportResponse,
  StaffReportRow,
  TopRouteReportRow,
} from '@/types/api.types';

type ReportTab = 'occupancy' | 'revenue' | 'top-routes' | 'staff';

function subtractDaysYmd(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return getDamascusDateYmd(d);
}

export default function AnalyticsPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ReportTab>('occupancy');
  const [fromDate, setFromDate] = useState(() => subtractDaysYmd(30));
  const [toDate, setToDate] = useState(() => getDamascusDateYmd());

  const [occupancy, setOccupancy] = useState<OccupancyReportRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueReportResponse | null>(null);
  const [topRoutes, setTopRoutes] = useState<TopRouteReportRow[]>([]);
  const [staffRows, setStaffRows] = useState<StaffReportRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = {
        from: fromDate || undefined,
        to: toDate || undefined,
      };
      const [occRes, revRes, topRes, staffRes] = await Promise.all([
        reportService.getOccupancy(range),
        reportService.getRevenue(range),
        reportService.getTopRoutes(range),
        reportService.getStaff(range),
      ]);
      setOccupancy(occRes.items);
      setRevenue(revRes);
      setTopRoutes(topRes.items);
      setStaffRows(staffRes.items);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function handleExport(format: 'csv' | 'pdf') {
    setExporting(format);
    try {
      const blob = await reportService.exportFile(activeTab, format, {
        from: fromDate || undefined,
        to: toDate || undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `masar-${activeTab}-${fromDate || 'all'}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(`تم تصدير التقرير بصيغة ${format.toUpperCase()} بنجاح.`);
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر تصدير ملف التقرير.',
        'error',
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <AuthGuard>
      <AppLayout>
        <RoleGuard allowedRoles={['ADMIN']}>
          <div className="space-y-6">
            <PageHeader
              title="التقارير والتحليلات المالية"
              subtitle="تقارير الإشغال والإيرادات المؤكدة فقط والخطوط الأعلى طلباً وأداء الموظفين مع التصدير"
              extraActions={
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={exporting === 'csv'}
                    onClick={() => void handleExport('csv')}
                  >
                    <Download className="h-4 w-4" />
                    تصدير CSV
                  </Button>
                  <Button
                    size="sm"
                    loading={exporting === 'pdf'}
                    onClick={() => void handleExport('pdf')}
                  >
                    <FileText className="h-4 w-4" />
                    تصدير PDF
                  </Button>
                </div>
              }
            />

            <Card className="p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-bold text-fg-muted mb-1">
                    من تاريخ
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-muted mb-1">
                    إلى تاريخ
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                </div>
                {revenue ? (
                  <div className="mr-auto flex items-center gap-6 rounded-xl bg-surface-muted px-4 py-2 border border-line">
                    <div>
                      <span className="text-xs text-fg-muted block">
                        إجمالي الإيرادات المؤكدة
                      </span>
                      <span className="text-base font-extrabold text-emerald-600 tabular-nums">
                        {formatPriceSyp(revenue.totalRevenue)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-fg-muted block">المقاعد المباعة</span>
                      <span className="text-base font-extrabold text-brand-600 tabular-nums">
                        {revenue.totalSeatsSold}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            <TabComponent
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab as ReportTab)}
              tabs={[
                { id: 'occupancy', label: 'نسب الإشغال', count: occupancy.length },
                { id: 'revenue', label: 'الإيرادات المؤكدة', count: revenue?.items.length },
                { id: 'top-routes', label: 'الخطوط الأعلى طلباً', count: topRoutes.length },
                { id: 'staff', label: 'نشاط الموظفين', count: staffRows.length },
              ]}
            />

            {error ? <ErrorHandler error={error} onRetry={() => void loadReports()} /> : null}
            {loading ? <TableSkeleton rows={6} /> : null}

            {/* Occupancy Report */}
            {!loading && !error && activeTab === 'occupancy' ? (
              occupancy.length === 0 ? (
                <EmptyState title="لا توجد بيانات إشغال في الفترة المحددة" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المسار</TableHead>
                      <TableHead>عدد الرحلات</TableHead>
                      <TableHead>المحجوز / السعة</TableHead>
                      <TableHead>نسبة الإشغال</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occupancy.map((row) => (
                      <TableRow key={`${row.originId}-${row.destinationId}`}>
                        <TableCell className="font-extrabold text-fg">{row.route}</TableCell>
                        <TableCell className="tabular-nums font-bold">
                          {row.tripsCount}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.bookedSeats} / {row.totalCapacity}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-[160px]">
                            <div className="flex-1 h-2.5 rounded-full bg-surface-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-brand-600"
                                style={{
                                  width: `${Math.min(100, Math.max(0, row.occupancyPercent))}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs font-extrabold text-fg tabular-nums w-12">
                              {row.occupancyPercent}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}

            {/* Revenue Report */}
            {!loading && !error && activeTab === 'revenue' ? (
              !revenue || revenue.items.length === 0 ? (
                <EmptyState title="لا توجد إيرادات مؤكدة في الفترة المحددة" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المسار</TableHead>
                      <TableHead>نوع الباص</TableHead>
                      <TableHead>عدد الحجوزات</TableHead>
                      <TableHead>المقاعد المباعة</TableHead>
                      <TableHead>الإيرادات المؤكدة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenue.items.map((row, idx) => (
                      <TableRow key={`${row.route}-${row.busType}-${idx}`}>
                        <TableCell className="font-extrabold text-fg">{row.route}</TableCell>
                        <TableCell>{row.busType}</TableCell>
                        <TableCell className="tabular-nums font-bold">
                          {row.bookingsCount}
                        </TableCell>
                        <TableCell className="tabular-nums font-bold">
                          {row.seatsSold}
                        </TableCell>
                        <TableCell className="tabular-nums font-extrabold text-emerald-600">
                          {formatPriceSyp(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}

            {/* Top Routes Report */}
            {!loading && !error && activeTab === 'top-routes' ? (
              topRoutes.length === 0 ? (
                <EmptyState title="لا توجد بيانات مسارات في الفترة المحددة" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الترتيب</TableHead>
                      <TableHead>المسار</TableHead>
                      <TableHead>الحجوزات المؤكدة</TableHead>
                      <TableHead>المقاعد المباعة</TableHead>
                      <TableHead>الإيرادات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topRoutes.map((row, index) => (
                      <TableRow key={row.route}>
                        <TableCell className="font-extrabold text-brand-600 tabular-nums">
                          #{index + 1}
                        </TableCell>
                        <TableCell className="font-extrabold text-fg">{row.route}</TableCell>
                        <TableCell className="tabular-nums">{row.bookingsCount}</TableCell>
                        <TableCell className="tabular-nums font-bold">
                          {row.seatsSold}
                        </TableCell>
                        <TableCell className="tabular-nums font-extrabold text-fg">
                          {formatPriceSyp(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}

            {/* Staff Activity Report */}
            {!loading && !error && activeTab === 'staff' ? (
              staffRows.length === 0 ? (
                <EmptyState title="لا توجد عمليات موظفين في الفترة المحددة" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الموظف</TableHead>
                      <TableHead>اسم المستخدم</TableHead>
                      <TableHead>الدور</TableHead>
                      <TableHead>حجوزات منفذة</TableHead>
                      <TableHead>إلغاءات منفذة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffRows.map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell className="font-extrabold text-fg">{row.name}</TableCell>
                        <TableCell className="tabular-nums">
                          {row.username ?? '-'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={row.role === 'ADMIN' ? 'info' : 'success'}
                            label={ArWeb.roles[row.role]}
                          />
                        </TableCell>
                        <TableCell className="tabular-nums font-extrabold text-brand-600">
                          {row.bookingsCreated}
                        </TableCell>
                        <TableCell className="tabular-nums font-bold text-rose-600">
                          {row.cancellationsProcessed}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}
          </div>
        </RoleGuard>
      </AppLayout>
    </AuthGuard>
  );
}
