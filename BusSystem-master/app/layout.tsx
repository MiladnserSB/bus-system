import React from 'react';
import { Cairo } from 'next/font/google';
import './globals.css';
import AppProviders from '@/components/providers/AppProviders';
import { themeInitScript } from '@/core/theme/themeScript';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata = {
  title: { default: 'BusWay | مركز إدارة العمليات', template: '%s | BusWay' },
  description: 'نظام إدارة الرحلات وحجز المقاعد لشركة النقليات بين المحافظات',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background text-fg antialiased font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
