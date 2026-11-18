'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, Search, User } from 'lucide-react';
import { useAuth } from '@/core/auth/AuthContext';
import { ThemeToggle } from '@/core/theme';
import { ArWeb } from '@/i18n/ar';

export default function Navbar({ onOpenMobileMenu }: { onOpenMobileMenu?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [quickCode, setQuickCode] = useState('');

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = quickCode.trim();
    if (!cleaned) return;
    router.push(`/bookings?code=${encodeURIComponent(cleaned.toUpperCase())}`);
  };

  const roleLabel =
    user?.role === 'ADMIN'
      ? ArWeb.roles.ADMIN
      : user?.role === 'RECEPTIONIST'
        ? ArWeb.roles.RECEPTIONIST
        : '';

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Right Side (RTL): Logo & Application Name (+ mobile menu toggle) */}
        <div className="flex items-center gap-3 shrink-0">
          {onOpenMobileMenu ? (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="فتح القائمة"
              className="lg:hidden grid h-10 w-10 place-items-center rounded-xl border border-line text-fg hover:bg-surface-muted cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}

          <Link href="/" className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white font-extrabold text-sm tracking-tight shadow-xs">
              BW
            </div>
            <div>
              <span className="font-extrabold text-lg block leading-none text-fg">
                {ArWeb.brand.name}
              </span>
              <span className="text-[11px] text-fg-muted hidden sm:block">
                {ArWeb.brand.subtitle}
              </span>
            </div>
          </Link>
        </div>

        {/* Left Side (RTL): Search Bar, Theme Toggle, User Profile & Role, Logout */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <form
            onSubmit={handleQuickSearch}
            className="hidden md:flex items-center relative md:w-52 lg:w-64 xl:w-72"
          >
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-fg-subtle pointer-events-none" />
            <input
              type="text"
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value)}
              placeholder="بحث برقم الحجز (BK-...)..."
              className="w-full rounded-xl border border-line bg-surface-muted py-2 pr-9 pl-4 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-600 focus:outline-none tabular-nums"
            />
          </form>

          <ThemeToggle />

          <Link
            href="/profile"
            className="flex items-center gap-2.5 border-r border-line pr-3 hover:opacity-80 shrink-0"
          >
            <div className="text-right hidden sm:block">
              <span className="block text-xs font-extrabold text-fg truncate max-w-[140px]">
                {user?.name ?? 'موظف BusWay'}
              </span>
              <span className="block text-[11px] text-brand-600 font-bold">{roleLabel}</span>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 border border-brand-100 text-brand-600 font-bold">
              <User className="h-4 w-4" />
            </div>
          </Link>

          <button
            type="button"
            onClick={() => void logout()}
            title={ArWeb.nav.logout}
            aria-label={ArWeb.nav.logout}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
