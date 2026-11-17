import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCountdown, useExpiresAtCountdown } from '../src/shared/hooks/useCountdown';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({}));

describe('Timer & Countdown Hooks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('useCountdown ticks down 60s resend timer and exposes start/reset/stop', () => {
    vi.useFakeTimers();
    let snapshot!: ReturnType<typeof useCountdown>;

    function Probe() {
      snapshot = useCountdown(3, true);
      return React.createElement('Probe');
    }

    act(() => {
      TestRenderer.create(React.createElement(Probe));
    });
    expect(snapshot.secondsLeft).toBe(3);
    expect(snapshot.formattedTime).toBe('00:03');
    expect(snapshot.isExpired).toBe(false);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(snapshot.secondsLeft).toBe(0);
    expect(snapshot.isExpired).toBe(true);
    expect(snapshot.isRunning).toBe(false);

    act(() => {
      snapshot.start(60);
    });
    expect(snapshot.secondsLeft).toBe(60);
    expect(snapshot.formattedTime).toBe('01:00');
    expect(snapshot.isRunning).toBe(true);

    act(() => {
      snapshot.reset();
    });
    expect(snapshot.secondsLeft).toBe(3);
    expect(snapshot.isRunning).toBe(false);
  });

  it('useExpiresAtCountdown tracks 5-minute Redis hold TTL and invokes onExpire at deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-01T08:00:00.000Z'));

    const onExpire = vi.fn();
    const expiresAt = new Date('2026-12-01T08:00:05.000Z').toISOString();
    let snapshot!: ReturnType<typeof useExpiresAtCountdown>;

    function Probe() {
      snapshot = useExpiresAtCountdown(expiresAt, onExpire);
      return React.createElement('Probe');
    }

    act(() => {
      TestRenderer.create(React.createElement(Probe));
    });
    expect(snapshot.secondsLeft).toBe(5);
    expect(snapshot.formattedTime).toBe('00:05');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(snapshot.secondsLeft).toBe(0);
    expect(snapshot.isExpired).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
