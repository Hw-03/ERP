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
