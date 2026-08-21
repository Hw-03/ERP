import { useCallback, useRef, useState } from "react";

/** 같은 BOM 묶음의 서버 재계산을 직렬화하고 저장·단계 이동용 대기 지점을 제공한다. */
export function useInternalUseBomPreviewLock() {
  const pendingRef = useRef<Map<string, Promise<void>>>(new Map());
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (bundleId: string, task: () => Promise<void>) => {
    const current = pendingRef.current.get(bundleId);
    if (current) {
      try {
        await current;
      } catch {
        // 첫 요청의 오류는 첫 호출자가 표시한다. 중복 입력은 실행하지 않는다.
      }
      return false;
    }

    // task를 microtask에서 시작해 pending 등록이 연속 이벤트보다 항상 먼저 끝나게 한다.
    const pending = Promise.resolve().then(task);
    pendingRef.current.set(bundleId, pending);
    setBusy(true);
    try {
      await pending;
      return true;
    } finally {
      pendingRef.current.delete(bundleId);
      if (pendingRef.current.size === 0) setBusy(false);
    }
  }, []);

  const waitForIdle = useCallback(async () => {
    while (pendingRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingRef.current.values()));
    }
  }, []);

  return { busy, run, waitForIdle };
}
