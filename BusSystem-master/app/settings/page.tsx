'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorHandler from '@/components/ui/ErrorHandler';
import PageHeader from '@/components/ui/PageHeader';
import { CardsGridSkeleton } from '@/components/ui/SkeletonLoader';
import { useToast } from '@/components/ui/ToastProvider';
import { WebApiError } from '@/core/api/client';
import { settingsService } from '@/core/api/services';
import AuthGuard from '@/core/auth/AuthGuard';
import { RoleGuard } from '@/core/auth/RoleGuard';

interface PolicyDraft {
  cancellationDeadlineHours: string;
  bookingCutoffMinutes: string;
  maxSeatsPerBooking: string;
  seatHoldTtlMinutes: string;
  templateGenerateAheadDays: string;
  tripAutoCompleteHours: string;
  reminderHoursBefore: string;
}

export default function SettingsPage() {
  const { showToast } = useToast();

  const [draft, setDraft] = useState<PolicyDraft>({
    cancellationDeadlineHours: '2',
    bookingCutoffMinutes: '30',
    maxSeatsPerBooking: '5',
    seatHoldTtlMinutes: '5',
    templateGenerateAheadDays: '14',
    tripAutoCompleteHours: '2',
    reminderHoursBefore: '24,2',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await settingsService.get();
      const p = res.policy;
      setDraft({
        cancellationDeadlineHours: String(p.cancellationDeadlineHours),
        bookingCutoffMinutes: String(p.bookingCutoffMinutes),
        maxSeatsPerBooking: String(p.maxSeatsPerBooking),
        seatHoldTtlMinutes: String(p.seatHoldTtlMinutes),
        templateGenerateAheadDays: String(p.templateGenerateAheadDays),
        tripAutoCompleteHours: String(p.tripAutoCompleteHours),
        reminderHoursBefore: p.reminderHoursBefore.join(','),
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsService.update({
        cancellationDeadlineHours: Number(draft.cancellationDeadlineHours),
        bookingCutoffMinutes: Number(draft.bookingCutoffMinutes),
        maxSeatsPerBooking: Number(draft.maxSeatsPerBooking),
        seatHoldTtlMinutes: Number(draft.seatHoldTtlMinutes),
        templateGenerateAheadDays: Number(draft.templateGenerateAheadDays),
        tripAutoCompleteHours: Number(draft.tripAutoCompleteHours),
        reminderHoursBefore: draft.reminderHoursBefore.trim(),
      });
      showToast('تم حفظ سياسات النظام وإعدادات التشغيل بنجاح.');
      await loadSettings();
    } catch (err) {
      showToast(
        err instanceof WebApiError ? err.message : 'تعذر حفظ الإعدادات.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGuard>
      <AppLayout>
        <RoleGuard allowedRoles={['ADMIN']}>
          <div className="max-w-4xl space-y-6">
            <PageHeader
              title="الإعدادات والسياسات التشغيلية"
              subtitle="ضبط القواعد الحاكمة للحجز، الإلغاء، التثبيت المؤقت، وتنبيهات الرحلات في النظام"
            />

            {error ? (
              <ErrorHandler error={error} onRetry={() => void loadSettings()} />
            ) : null}
            {loading ? <CardsGridSkeleton count={4} /> : null}

            {!loading && !error ? (
              <form onSubmit={handleSave} className="space-y-6">
                <Card className="p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-bold text-fg mb-1">
                        مهلة الإلغاء قبل الانطلاق (بالساعات)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={72}
                        value={draft.cancellationDeadlineHours}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            cancellationDeadlineHours: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                        required
                      />
                      <span className="mt-1 block text-xs text-fg-subtle">
                        الحد الزمني الأقصى المسموح به للزبون وموظف الاستقبال لإلغاء الحجز.
                      </span>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-fg mb-1">
                        إغلاق الحجز قبل الانطلاق (بالدقائق)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={360}
                        value={draft.bookingCutoffMinutes}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            bookingCutoffMinutes: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                        required
                      />
                      <span className="mt-1 block text-xs text-fg-subtle">
                        تتحول الرحلة تلقائياً إلى مغلقة عند الوصول لهذا الحد.
                      </span>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-fg mb-1">
                        الحد الأقصى للمقاعد في الحجز الواحد
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={draft.maxSeatsPerBooking}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            maxSeatsPerBooking: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                        required
                      />
                      <span className="mt-1 block text-xs text-fg-subtle">
                        ينطبق على حجوزات التطبيق والويب لحماية المقاعد.
                      </span>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-fg mb-1">
                        مدة التثبيت المؤقت للمقاعد (بالدقائق)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={draft.seatHoldTtlMinutes}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            seatHoldTtlMinutes: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                        required
                      />
                      <span className="mt-1 block text-xs text-fg-subtle">
                        المدة التي يُحجز فيها المقعد مؤقتاً في Redis قبل التأكيد.
                      </span>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-fg mb-1">
                        أفق التوليد المسبق للقوالب (بالأيام)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={draft.templateGenerateAheadDays}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            templateGenerateAheadDays: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-fg mb-1">
                        اكتمال الرحلة تلقائياً بعد الانطلاق (بالساعات)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={48}
                        value={draft.tripAutoCompleteHours}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            tripAutoCompleteHours: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg tabular-nums"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-bold text-fg mb-1">
                        مواعيد تذكير الركاب قبل الرحلة (ساعات مفصولة بفاصلة)
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={draft.reminderHoursBefore}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            reminderHoursBefore: e.target.value,
                          }))
                        }
                        placeholder="24,2"
                        className="w-full max-w-sm rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg text-left tabular-nums"
                        required
                      />
                      <span className="mt-1 block text-xs text-fg-subtle">
                        القيمة الافتراضية: إرسال إشعار قبل 24 ساعة ثم قبل ساعتين من الرحلة.
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-line">
                    <Button type="submit" size="lg" loading={saving}>
                      <Save className="h-4 w-4" />
                      حفظ وتطبيق السياسات
                    </Button>
                  </div>
                </Card>
              </form>
            ) : null}
          </div>
        </RoleGuard>
      </AppLayout>
    </AuthGuard>
  );
}
