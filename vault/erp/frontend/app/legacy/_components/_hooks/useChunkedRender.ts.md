---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useChunkedRender.ts
tags: [vault, code-note, b-tier]
---

# useChunkedRender.ts — 대량 배열 청크 누적 렌더링

> [!summary] 역할
> 1000+ 행 테이블의 렌더 비용 분산. IntersectionObserver로 sentinel 감지 후 +chunk 누적.

## 1. 이 파일의 역할
- useChunkedRender<T>(items, chunkSize=50) — 초기 chunk만 노출
- sentinelRef를 리스트 끝에 연결 → sentinel 가시 영역 진입 시 +chunk 누적
- items 변경 시 첫 chunk로 리셋 (참조 동등성 + 길이 기반 가벼운 키)
- 반환: { visible, sentinelRef, hasMore, total, shown }

## 2. 실제 원본 위치
`frontend/app/legacy/_components/_hooks/useChunkedRender.ts` — 49줄

## 3. 주요 import
```typescript
import { useEffect, useMemo, useRef, useState } from "react";
```

## 4. 어디서 쓰이는지
- 재고 목록 (1000+ 행)
- 거래 이력 (월별 누적)
- 부서 조정 큐

## 5. ⚠️ 위험 포인트
- **items는 항상 새 배열로 교체 가정** — 동일 참조의 mutation은 리셋 안 됨
- sentinel이 없거나 observe 미완료 시 추가 chunk 로드 안 됨
- 렌더 비용이 많으면 프레임 드롭 여전히 가능 (극단적 대량은 가상화 라이브러리 필요)
- rootMargin:200px — 스크롤 속도에 따라 gap 발생 가능

## 6. 수정 전 체크
- items 1000개 → visible.length === 50 초기 확인
- sentinel 가시 영역 진입 시 visible.length += 50 확인
- items 변경 → visible.length 리셋되어 50으로 돌아감 확인
