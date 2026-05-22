---
type: file-explanation
source_path: "frontend/app/legacy/_components/_hooks/useResource.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useResource.ts — useResource.ts 설명

## 이 파일은 무엇을 책임지나

`useResource.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useResource`
- `Resource`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_hooks/📁__hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

// 외부 라이브러리(SWR/React Query) 미도입 정책 하에서
// 로딩/에러/리트라이 모양을 통일하기 위한 자체 hook.
// 5.5-F: AbortController 옵션 추가 — fetcher 가 signal 받으면 자동 abort 처리.

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
 * fetcher 가 signal 인자를 받도록 정의하면 race 자동 처리:
 *   const inv = useResource((signal) => api.getInventorySummary({ signal }), []);
 * 받지 않아도 호환 (signal 옵셔널):
 *   const inv = useResource(() => api.getInventorySummary(), []);
 *
 * 사용 예시:
 *   const inv = useResource(() => api.getInventorySummary(), []);
 *   if (inv.loading) return <LoadingSkeleton />;
 *   if (inv.error)  return <LoadFailureCard message={inv.error} onRetry={inv.reload} />;
 *   const data = inv.data!;
 */
export function useResource<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  deps: unknown[],
  options?: { initial?: T },
): Resource<T> {
  const [data, setData] = useState<T | undefined>(options?.initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const activeCtrlRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    activeCtrlRef.current?.abort();
    const ctrl = new AbortController();
    activeCtrlRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const next = await fetcherRef.current(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setData(next);
    } catch (err) {
```
