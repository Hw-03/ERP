---
type: file-explanation
source_path: "frontend/app/legacy/_components/_hooks/useChunkedRender.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useChunkedRender.ts — useChunkedRender.ts 설명

## 이 파일은 무엇을 책임지나

`useChunkedRender.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useChunkedRender`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_hooks/📁__hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 큰 배열을 chunk 단위로 누적 렌더링.
 *
 * - 초기에는 첫 chunk(default 50)만 노출
 * - 반환된 `sentinelRef`를 리스트 끝(혹은 보이는 영역 근처)에 연결하면
 *   IntersectionObserver가 sentinel이 가시 영역에 들어올 때마다 +chunk 만큼 누적
 * - items 자체가 바뀌면(필터/정렬 등) 첫 chunk로 리셋
 *
 * 외부 라이브러리 의존성 없음. 1000+ 행 테이블에서 일괄 렌더 비용을 분산.
 */
export function useChunkedRender<T>(items: T[], chunkSize = 50) {
  const [count, setCount] = useState(chunkSize);
  const sentinelRef = useRef<HTMLElement | null>(null);

  // items 가 바뀌면 첫 chunk로 리셋 (참조 동등성 + 길이 합산으로 가벼운 키)
  // — 같은 참조의 mutation은 잡지 못하지만 본 프로젝트에서 items는 항상 새 배열로 교체됨.
  useEffect(() => {
    setCount(chunkSize);
  }, [items, chunkSize]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (count >= items.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setCount((c) => Math.min(c + chunkSize, items.length));
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [count, items.length, chunkSize]);

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  const hasMore = count < items.length;

  return { visible, sentinelRef, hasMore, total: items.length, shown: visible.length } as const;
}
```
