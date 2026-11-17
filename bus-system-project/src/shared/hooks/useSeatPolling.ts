import { useCallback, useEffect, useRef, useState } from 'react';
import { SeatMapResponse } from '../types/api.types';

const POLLING_INTERVAL_MS = 10_000; // 10 seconds per SRS 3.4 & Step 3

/**
 * Polls seat map every 10 seconds while enabled, supporting manual refresh.
 */
export function useSeatPolling(
  fetchSeats: () => Promise<SeatMapResponse>,
  enabled = true,
  onData?: (data: SeatMapResponse) => void,
) {
  const [seatMap, setSeatMap] = useState<SeatMapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchRef = useRef(fetchSeats);
  const onDataRef = useRef(onData);

  useEffect(() => {
    fetchRef.current = fetchSeats;
    onDataRef.current = onData;
  }, [fetchSeats, onData]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshNow = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }
    try {
      const data = await fetchRef.current();
      if (!mountedRef.current) return null;
      setSeatMap(data);
      setError(null);
      onDataRef.current?.(data);
      return data;
    } catch (err) {
      if (!mountedRef.current) return null;
      setError(err instanceof Error ? err.message : 'تعذر تحديث خريطة المقاعد');
      return null;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const runFetch = () => {
      void fetchRef
        .current()
        .then((data) => {
          if (!mountedRef.current) return;
          setSeatMap(data);
          setError(null);
          onDataRef.current?.(data);
        })
        .catch((err) => {
          if (!mountedRef.current) return;
          setError(err instanceof Error ? err.message : 'تعذر تحديث خريطة المقاعد');
        })
        .finally(() => {
          if (mountedRef.current) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        });
    };

    runFetch();
    const interval = setInterval(runFetch, POLLING_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [enabled]);

  return {
    seatMap,
    setSeatMap,
    isLoading,
    isRefreshing,
    error,
    refreshNow,
  };
}
