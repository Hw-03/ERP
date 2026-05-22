---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_warehouse_sections/IoDraftWorkCard.tsx
tags: [vault, code-note, frontend, b-tier]
---

# IoDraftWorkCard — IO Draft 카드 (V2)

> [!summary] 역할
> IoBatch(IO draft) 카드 표시. 메타·라인 미리보기·상대시간. 계속/삭제 버튼.

## 1. 이 파일의 역할

warehouse_v2 IO workflow draft를 카드 표시. workType/subType 레이블, 라인별 tag, 부서 표시. UTC timezone 보정(backend datetime.utcnow 대응). collapsed 상태로 라인 접기. isBusy 플래그로 액션 비활성화.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_warehouse_sections/IoDraftWorkCard.tsx` ([[erp/frontend/app/legacy\_components\_warehouse_sections/IoDraftWorkCard.tsx|원본]])

## 3. 주요 import

- React: `useMemo`, `useState`
- `IoBatch`, `IoLine`, `IoSubType` from `@/lib/api`
- `LEGACY_COLORS`, `tint` from `@/lib/mes/color[Utils]`
- `IO_WORK_TYPES`, `deptIoDisplayLabel`, `lineTagLabel`, `subTypeLabel` from `../\_warehouse_v2/ioWorkType`
- Icons: `AlertTriangle`, `ChevronDown`, `ChevronUp`

## 4. 어디서 쓰이는지

- DraftCartPanel 또는 IO draft 목록
- 부모: 입출고 draft 카드 목록

## 5. ⚠️ 위험 포인트

> [!warning] parseServerTime: UTC timezone 보정 (TODO: backend 정규화 후 제거)
> collapsed state toggle 시 UI reflow

## 6. 수정 전 체크

- [ ] backend UTC 정규화 완료 시 parseServerTime 제거
- [ ] IO_WORK_TYPES 확장 후 태그 레이블 동기화
