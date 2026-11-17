'use client';

import React from 'react';
import { cn } from '@/core/utils/cn';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export default function TabComponent({
  tabs,
  activeTab,
  onChange,
  className,
}: {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-2 border-b border-line pb-3 overflow-x-auto',
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer',
              isActive
                ? 'bg-brand-600 text-white shadow-xs'
                : 'bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg border border-line',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  'mr-2 px-2 py-0.5 rounded-full text-xs tabular-nums',
                  isActive ? 'bg-white/20 text-white' : 'bg-surface-muted text-fg-muted',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
