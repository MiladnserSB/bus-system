import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCountdownMMSS } from '../constants/helpers';

/**
 * Duration countdown hook (e.g., 60s OTP resend timer).
 */
export function useCountdown(initialSeconds: number, autoStart = false) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart && initialSeconds > 0);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  const start = useCallback(
    (overrideSeconds?: number) => {
      const target = overrideSeconds ?? initialSeconds;
      setSecondsLeft(target);
      setIsRunning(target > 0);
    },
    [initialSeconds],
  );

  const stop = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(
    (overrideSeconds?: number) => {
      setIsRunning(false);
      setSecondsLeft(overrideSeconds ?? initialSeconds);
    },
    [initialSeconds],
  );

  return {
    secondsLeft,
    formattedTime: formatCountdownMMSS(secondsLeft),
    isRunning,
    isExpired: secondsLeft <= 0,
    start,
    stop,
    reset,
  };
}

/**
 * Server-timestamp synced countdown (used for 5-minute Redis seat holds so backgrounding does not drift).
 */
export function useExpiresAtCountdown(
  expiresAtIso: string | null,
  onExpire?: () => void,
) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!expiresAtIso) return;
    const targetMs = new Date(expiresAtIso).getTime();

    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      if (current >= targetMs) {
        onExpireRef.current?.();
      }
    };

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAtIso]);

  const secondsLeft = expiresAtIso
    ? Math.max(0, Math.ceil((new Date(expiresAtIso).getTime() - nowMs) / 1000))
    : 0;

  return {
    secondsLeft,
    formattedTime: formatCountdownMMSS(secondsLeft),
    isExpired: Boolean(expiresAtIso) && secondsLeft <= 0,
  };
}
