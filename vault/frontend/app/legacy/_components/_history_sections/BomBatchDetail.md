---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/BomBatchDetail.tsx
tags: [vault, code-note, frontend, b-tier]
---

# BomBatchDetail — BOM 거래 배치 상세

> [!summary] 역할
> IoBatch 상세 표시. 번들·라인 계층 트리, 부호(증감/이동) 표시.

## 1. 이 파일의 역할

거래 상세 패널에서 BOM 처리 결과 표시. IoBatch를 ioApi.getBatch()로 로드(캐시 활용). 번들별 collapsible, 라인별 signed quantity(증가/감소/이동) 색상. 부호 톤(SIGN_TONE_HEX) 매핑. colSpan 테이블 전체폭 차지.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/BomBatchDetail.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/BomBatchDetail.tsx|원본]])

## 3. 주요 import

- React: `useEffect`, `useState`
- `ioApi`, `IoBatch`, `IoBundle`, `IoLine` from `@/lib/api/[io|types]`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `formatQty` from `@/lib/mes/format`
- `getHistoryBomParentLine`, `getHistoryLineSignedQuantity`, `getHistoryLineStatusLabel` from `./historyBatchInterpreter`
- Icons: `ChevronDown`, `ChevronRight`, `GitBranch`, `Package`

## 4. 어디서 쓰이는지

- HistoryDetailPanel의 BOM 거래 상세 확장
- 부모: 거래 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] cache Map — 부모와 동기화 필수 (중복 요청 방지)
> 로드 실패 시 에러 상태 처리 누락 가능

## 6. 수정 전 체크

- [ ] ioApi.getBatch() 응답 포맷 변경 시 batch state 동기화
- [ ] expandedBundles state 초기화 타이밍 확인
