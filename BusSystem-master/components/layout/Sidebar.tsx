'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bus,
  CalendarDays,
  LayoutDashboard,
  MapPin,
  Route,
  Settings,
  ShieldAlert,
  TicketCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/core/auth/AuthContext';
import { cn } from '@/core/utils/cn';
import { ArWeb } from '@/i18n/ar';
import { UserRole } from '@/types/api.types';

export interface NavItem {
  name: string;
  href: string;
  roles: UserRole[];
  icon: React.ComponentType<{ className?: string }>;
}

export const WEB_NAVIGATION: NavItem[] = [
  {
    name: ArWeb.nav.dashboard,
    href: '/',
    roles: ['ADMIN', 'RECEPTIONIST'],
    icon: LayoutDashboard,
  },
  {
    name: ArWeb.nav.trips,
    href: '/trips',
    roles: ['ADMIN', 'RECEPTIONIST'],
    icon: Route,
  },
  {
    name: ArWeb.nav.bookings,
    href: '/bookings',
    roles: ['ADMIN', 'RECEPTIONIST'],
    icon: TicketCheck,
  },
  {
    name: ArWeb.nav.scheduledTrips,
    href: '/scheduled-trips',
    roles: ['ADMIN'],
    icon: CalendarDays,
  },
  {
    name: ArWeb.nav.cities,
    href: '/stations',
    roles: ['ADMIN'],
    icon: MapPin,
  },
  {
    name: ArWeb.nav.fleet,
    href: '/fleet',
    roles: ['ADMIN'],
    icon: Bus,
  },
  {
    name: ArWeb.nav.reports,
    href: '/analytics',
    roles: ['ADMIN'],
    icon: BarChart3,
  },
  {
    name: ArWeb.nav.staff,
    href: '/staff',
    roles: ['ADMIN'],
    icon: Users,
  },
  {
    name: ArWeb.nav.audit,
    href: '/audit',
    roles: ['ADMIN'],
    icon: ShieldAlert,
  },
  {
    name: ArWeb.nav.settings,
    href: '/settings',
    roles: ['ADMIN'],
    icon: Settings,
  },
  {
    name: ArWeb.nav.profile,
    href: '/profile',
    roles: ['ADMIN', 'RECEPTIONIST'],
    icon: UserCog,
  },
];

export function getNavigationForRole(role?: UserRole): NavItem[] {
  if (!role) return [];
  return WEB_NAVIGATION.filter((item) => item.roles.includes(role));
}

export default function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = getNavigationForRole(user?.role);

  const navContent = (
    <div className="p-4 space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onCloseMobile}
            className={cn(
              'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-colors',
              isActive
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      <aside className="no-print w-64 border-l border-line bg-surface hidden lg:block shrink-0 min-h-[calc(100vh-4rem)]">
        {navContent}
      </aside>

      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-72 bg-surface border-l border-line min-h-screen shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="font-extrabold text-brand-600">القائمة الرئيسية</span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="إغلاق القائمة"
                className="p-2 rounded-lg text-fg-muted hover:bg-surface-muted cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      ) : null}
    </>
  );
}
