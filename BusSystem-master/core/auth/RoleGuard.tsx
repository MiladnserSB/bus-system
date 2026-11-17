'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { UserRole } from '@/types/api.types';
import { useAuth } from './AuthContext';

export function RoleGuard({
  allowedRoles = [],
  children,
}: {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
}) {
  const { hasRole } = useAuth();

  if (!hasRole(allowedRoles)) {
    return (
      <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-900 my-6">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-rose-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-rose-700 dark:text-rose-400 mb-2">
          عذراً، ليس لديك صلاحية الوصول
        </h3>
        <p className="text-sm text-rose-600 dark:text-rose-300 mb-4">
          هذه الصفحة مخصصة لصلاحيات الإدارة العليا (المدير) فقط وفق قواعد الصلاحية RBAC.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
        >
          العودة إلى الرئيسية
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
