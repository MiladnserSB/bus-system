'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Eye, RotateCcw } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorHandler from '@/components/ui/ErrorHandler';
import ModalShell from '@/components/ui/ModalShell';
import PageHeader from '@/components/ui/PageHeader';
import Pagination from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { auditLogService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { RoleGuard } from '@/core/auth/RoleGuard';
import { formatDamascusDateTime } from '@/core/utils/formatters';
import { AuditLogDto, PaginationMeta } from '@/types/api.types';

export default function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogDto | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await auditLogService.findAll({
        action: actionFilter.trim() || undefined,
        entity: entityFilter.trim() || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        page,
        limit: 20,
      });
      setLogs(res.items);
      setMeta(res.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter, fromDate, toDate, page]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <AuthGuard>
      <AppLayout>
        <RoleGuard allowedRoles={['ADMIN']}>
          <div className="space-y-6">
            <PageHeader
              title="سجل التدقيق والعمليات"
              subtitle="توثيق غير قابل للتعديل لجميع الإجراءات الإدارية والحجوزات والإلغاءات وتغييرات السياسة"
            />

            <Card className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-fg-muted mb-1">
                    الإجراء (Action)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={actionFilter}
                    onChange={(e) => {
                      setActionFilter(e.target.value);
                      setPage(1);
                    }}
                    placeholder="CREATE_BOOKING..."
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-muted mb-1">
                    الكيان (Entity)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={entityFilter}
                    onChange={(e) => {
                      setEntityFilter(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Booking / Trip / User"
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-muted mb-1">
                    من تاريخ
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-fg-muted mb-1">
                    إلى تاريخ
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActionFilter('');
                    setEntityFilter('');
                    setFromDate('');
                    setToDate('');
                    setPage(1);
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  إعادة ضبط
                </Button>
              </div>
            </Card>

            {error ? <ErrorHandler error={error} onRetry={() => void loadLogs()} /> : null}
            {loading ? <TableSkeleton rows={8} /> : null}

            {!loading && !error && logs.length === 0 ? (
              <EmptyState title="لا توجد سجلات مطابقة" />
            ) : null}

            {!loading && !error && logs.length > 0 ? (
              <div className="rounded-2xl border border-line bg-surface overflow-hidden">
                <Table className="border-0 rounded-none shadow-none">
                  <TableHeader>
                    <TableRow>
                      <TableHead>الوقت (دمشق)</TableHead>
                      <TableHead>المستخدم</TableHead>
                      <TableHead>العملية</TableHead>
                      <TableHead>الكيان والمُعرّف</TableHead>
                      <TableHead>التفاصيل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-bold text-fg tabular-nums">
                          {formatDamascusDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          {log.user ? (
                            <div>
                              <span className="font-bold text-fg block">{log.user.name}</span>
                              <span className="text-xs text-fg-subtle">{log.user.role}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-fg-subtle">النظام / تلقائي</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status="info" label={log.action} />
                        </TableCell>
                        <TableCell className="tabular-nums font-bold text-fg" dir="ltr">
                          {log.entity} #{log.entityId}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            JSON
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={meta.page}
                  totalPages={meta.totalPages}
                  onPageChange={(next) => setPage(next)}
                />
              </div>
            ) : null}
          </div>

          <ModalShell
            isOpen={Boolean(selectedLog)}
            onClose={() => setSelectedLog(null)}
            title={
              selectedLog
                ? `تفاصيل السجل #${selectedLog.id} — ${selectedLog.action}`
                : 'تفاصيل السجل'
            }
            maxWidthClass="max-w-2xl"
          >
            {selectedLog ? (
              <pre
                dir="ltr"
                className="max-h-96 overflow-auto rounded-xl bg-slate-950 text-slate-100 p-4 text-xs leading-relaxed text-left"
              >
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            ) : null}
          </ModalShell>
        </RoleGuard>
      </AppLayout>
    </AuthGuard>
  );
}
