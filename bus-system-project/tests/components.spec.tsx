import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const createComponent =
    (name: string) =>
    ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement(name, props, children);

  class AnimatedValue {
    value: number;
    constructor(val: number) {
      this.value = val;
    }
  }

  return {
    Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
    I18nManager: { isRTL: true, allowRTL: vi.fn(), forceRTL: vi.fn() },
    StyleSheet: { create: <T extends Record<string, unknown>>(s: T) => s },
    Animated: {
      Value: AnimatedValue,
      View: createComponent('AnimatedView'),
      timing: () => ({ start: vi.fn() }),
      sequence: () => ({ start: vi.fn() }),
      loop: () => ({ start: vi.fn(), stop: vi.fn() }),
    },
    View: createComponent('View'),
    Text: createComponent('Text'),
    TextInput: createComponent('TextInput'),
    TouchableOpacity: createComponent('TouchableOpacity'),
    Modal: createComponent('Modal'),
    ActivityIndicator: createComponent('ActivityIndicator'),
    ScrollView: createComponent('ScrollView'),
    RefreshControl: createComponent('RefreshControl'),
  };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, ...props }: { name: string }) =>
    React.createElement('Ionicons', { name, ...props }),
}));

vi.mock('../src/shared/hooks/useNetwork', () => ({
  useNetwork: () => ({
    isConnected: false,
    isInternetReachable: false,
    isOffline: true,
    checkNow: vi.fn(async () => false),
  }),
}));

import { EmptyState } from '../src/shared/components/EmptyState';
import { ErrorBanner } from '../src/shared/components/ErrorBanner';
import {
  SeatMapSkeleton,
  TicketSkeleton,
  TripListSkeleton,
} from '../src/shared/components/LoadingSkeleton';
import { OfflineBanner } from '../src/shared/components/OfflineBanner';
import { SeatMapGrid } from '../src/shared/components/SeatMapGrid';
import { Colors } from '../src/shared/theme/colors';
import { SeatDto } from '../src/shared/types/api.types';

function makePresetSeats(
  leftCount: number,
  rightCount: number,
  rowsCount: number,
  hasExtra: boolean,
): SeatDto[] {
  const list: SeatDto[] = [];
  for (let row = 1; row <= rowsCount; row += 1) {
    let code = 'A'.charCodeAt(0);
    for (let l = 0; l < leftCount; l += 1) {
      const colLetter = String.fromCharCode(code++);
      list.push({
        seatNumber: `${row}${colLetter}`,
        rowNumber: row,
        colLetter,
        side: 'LEFT',
        colIndex: l,
        isExtra: false,
        status: 'AVAILABLE',
      });
    }
    if (hasExtra && row === rowsCount) {
      list.push({
        seatNumber: `${row}E`,
        rowNumber: row,
        colLetter: 'E',
        side: 'MIDDLE',
        colIndex: leftCount,
        isExtra: true,
        status: 'AVAILABLE',
      });
    }
    for (let r = 0; r < rightCount; r += 1) {
      let colLetter = String.fromCharCode(code);
      if (colLetter === 'E') {
        code += 1;
        colLetter = String.fromCharCode(code);
      }
      code += 1;
      list.push({
        seatNumber: `${row}${colLetter}`,
        rowNumber: row,
        colLetter,
        side: 'RIGHT',
        colIndex: leftCount + (hasExtra && row === rowsCount ? 1 : 0) + r,
        isExtra: false,
        status: 'AVAILABLE',
      });
    }
  }
  return list;
}

function collectTexts(node: ReactTestInstance): string[] {
  return node.findAllByType('Text' as unknown as React.ComponentType).map((t) =>
    t.children.map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join(''),
  );
}

describe('Component & UI Tests (6 Bus Layouts, Seat States, Skeletons & Error UI)', () => {
  it.each([
    { title: '18 Business 1+1', left: 1, right: 1, rows: 9, extra: false, count: 18 },
    { title: '22 Business 1+1', left: 1, right: 1, rows: 11, extra: false, count: 22 },
    { title: '27 First Class 2+1', left: 2, right: 1, rows: 9, extra: false, count: 27 },
    { title: '33 First Class 2+1', left: 2, right: 1, rows: 11, extra: false, count: 33 },
    { title: '37 Standard 2+2+9E', left: 2, right: 2, rows: 9, extra: true, count: 37 },
    { title: '45 Standard 2+2+11E', left: 2, right: 2, rows: 11, extra: true, count: 45 },
  ])('renders all seats & non-color legend cleanly for $title', ({ left, right, rows, extra, count }) => {
    const seats = makePresetSeats(left, right, rows, extra);
    const onToggleSeat = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <SeatMapGrid
          seats={seats}
          selectedSeatNumbers={[]}
          busTypeName={`باص ${count}`}
          layout={`${left}+${right}`}
          onToggleSeat={onToggleSeat}
        />,
      );
    });

    const buttons = tree.root.findAllByType('TouchableOpacity' as unknown as React.ComponentType);
    expect(buttons).toHaveLength(count);

    const texts = collectTexts(tree.root);
    expect(texts).toContain('متاح');
    expect(texts).toContain('محدد ✓');
    expect(texts).toContain('قيد الحجز');
    expect(texts).toContain('محجوز');

    if (extra) {
      expect(texts).toContain(`${rows}E`);
      expect(texts).toContain('إضافي');
    } else {
      expect(texts).not.toContain('إضافي');
    }
  });

  it('renders distinct SRS 3.1.1 colors, symbols (✓ / ×) and enforces disabled booked/held seats', () => {
    const seats: SeatDto[] = [
      { seatNumber: '1A', rowNumber: 1, colLetter: 'A', side: 'LEFT', colIndex: 0, isExtra: false, status: 'AVAILABLE' },
      { seatNumber: '1B', rowNumber: 1, colLetter: 'B', side: 'LEFT', colIndex: 1, isExtra: false, status: 'BOOKED' },
      { seatNumber: '1C', rowNumber: 1, colLetter: 'C', side: 'RIGHT', colIndex: 2, isExtra: false, status: 'HELD' },
      { seatNumber: '1D', rowNumber: 1, colLetter: 'D', side: 'RIGHT', colIndex: 3, isExtra: false, status: 'HELD_BY_ME' },
    ];
    const onToggleSeat = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <SeatMapGrid
          seats={seats}
          selectedSeatNumbers={['1D']}
          busTypeName="عادية"
          layout="2+2"
          onToggleSeat={onToggleSeat}
        />,
      );
    });

    const buttons = tree.root.findAllByType('TouchableOpacity' as unknown as React.ComponentType);
    const btn1A = buttons.find((b) => String(b.props.accessibilityLabel).includes('1A'))!;
    const btn1B = buttons.find((b) => String(b.props.accessibilityLabel).includes('1B'))!;
    const btn1C = buttons.find((b) => String(b.props.accessibilityLabel).includes('1C'))!;
    const btn1D = buttons.find((b) => String(b.props.accessibilityLabel).includes('1D'))!;

    expect(btn1A.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.seatAvailable })]));
    expect(btn1B.props.disabled).toBe(true);
    expect(btn1B.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.seatBooked })]));
    expect(collectTexts(btn1B)).toContain('×');
    expect(btn1C.props.disabled).toBe(true);
    expect(btn1C.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.seatHeld })]));
    expect(btn1D.props.disabled).toBe(false);
    expect(btn1D.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: Colors.seatSelected })]));
    expect(collectTexts(btn1D)).toContain('✓');

    act(() => {
      btn1A.props.onPress();
    });
    expect(onToggleSeat).toHaveBeenCalledWith(expect.objectContaining({ seatNumber: '1A' }));
  });

  it('renders LoadingSkeleton, ErrorBanner retry, EmptyState CTA, and OfflineBanner cleanly', () => {
    const onRetry = vi.fn();
    const onEmptyAction = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <>
          <OfflineBanner />
          <TripListSkeleton count={2} />
          <SeatMapSkeleton />
          <TicketSkeleton />
          <ErrorBanner message="انقطع الاتصال" onRetry={onRetry} />
          <EmptyState title="لا توجد رحلات" subtitle="جرّب يوماً آخر" actionTitle="تعديل البحث" onAction={onEmptyAction} />
        </>,
      );
    });

    const texts = collectTexts(tree.root);
    expect(texts).toContain('لا يوجد اتصال بالإنترنت — يرجى التحقق من الشبكة والمحاولة مجدداً');
    expect(texts).toContain('انقطع الاتصال');
    expect(texts).toContain('لا توجد رحلات');

    const buttons = tree.root.findAllByType('TouchableOpacity' as unknown as React.ComponentType);
    const retryBtn = buttons.find((b) => b.props.accessibilityLabel === 'إعادة المحاولة')!;
    const actionBtn = buttons.find((b) => b.props.accessibilityLabel === 'تعديل البحث')!;
    act(() => {
      retryBtn.props.onPress();
      actionBtn.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onEmptyAction).toHaveBeenCalledTimes(1);
  });
});
