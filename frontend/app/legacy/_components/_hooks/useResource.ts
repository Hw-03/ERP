"use client";

// 외부 라이브러리(SWR/React Query) 미도입 정책 하에서
// 로딩/에러/리트라이 모양을 통일하기 위한 자체 hook.

import { useCallback, useEffect, useRef, useState } from "react";

export type Resource<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** 강제 재조회. 에러 후 사용자가 "다시 시도" 버튼을 누르는 경로. */
  reload: () => Promise<void>;
};

/**
 * 단일 fetcher 의 결과를 data/loading/error 모양으로 노출한다.
 * deps 가 바뀌면 재조회한다.
 *
 * 사용 예시:
 *   const inv = useResource(() => api.getInventorySummary(), []);
 *   if (inv.loading) return <LoadingSkeleton />;
 *   if (inv.error)  return <LoadFailureCard message={inv.error} onRetry={inv.reload} />;
 *   const data = inv.data!;
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: { initial?: T },
): Resource<T> {
  const [data, setData] = useState<T | undefined>(options?.initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetcherRef.current();
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload };
}
