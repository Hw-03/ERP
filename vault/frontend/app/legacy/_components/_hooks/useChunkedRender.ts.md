---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_hooks/useChunkedRender.ts
status: active
updated: 2026-04-27
source_sha: 049af23d1410
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useChunkedRender.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_hooks/useChunkedRender.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `1770` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_hooks/_hooks|frontend/app/legacy/_components/_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
