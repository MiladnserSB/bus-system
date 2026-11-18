import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Compass className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-extrabold text-fg tabular-nums">404</h1>
        <h2 className="mt-2 text-lg font-bold text-fg">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-fg-muted">
          المسار الذي تحاول الوصول إليه غير متاح في لوحة إدارة BusWay.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          العودة إلى الرئيسية
        </Link>
      </div>
    </div>
  );
}
