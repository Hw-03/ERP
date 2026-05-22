---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/
tags: [vault, index, folder-marker]
aliases:
  - "mes"
  - "mes.md"
---

# 📁 mes

> [!summary] 역할
> MES 도메인 순수 유틸 모음 — 색상·포맷·거래 분류·공정·재고 상태 등 UI 로직.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/lib/mes/` 의 vault 미러.

## 어떤 파일들이 있나

barrel:
- [[erp/frontend/lib/mes/index.ts|index.ts]] — `format / department / status / transaction / color / colorUtils` 재노출

색상·스타일:
- [[erp/frontend/lib/mes/color.ts|color.ts]] — `LEGACY_COLORS` (CSS 변수 17종), `OPTION_COLOR`, `optionColor`, `employeeColor`. Round-10 정본
- [[erp/frontend/lib/mes/colorUtils.ts|colorUtils.ts]] — `tint(color, pct)` 헬퍼 (color-mix 단축)

도메인 유틸:
- [[erp/frontend/lib/mes/format.ts|format.ts]] — `../mes-format` thin re-export (`formatQty` 등)
- [[erp/frontend/lib/mes/department.ts|department.ts]] — `../mes-department` thin re-export (`getDepartmentFallbackColor` 등)
- [[erp/frontend/lib/mes/status.ts|status.ts]] — `../mes-status` thin re-export (`MesTone`, `toMesTone`, `inferTone`)
- [[erp/frontend/lib/mes/transaction.ts|transaction.ts]] — `TRANSACTION_META`, `getTransactionLabel`, `getTransactionTone`, `transactionIconName`, `transactionColor`
- [[erp/frontend/lib/mes/item.ts|item.ts]] — `buildItemSearchLabel`, `itemMatchesKpi`, `groupedItems` (순수 Item 뷰 유틸)
- [[erp/frontend/lib/mes/inventory.ts|inventory.ts]] — `getStockState`, `LEGACY_FILE_TYPES`, `LEGACY_PARTS`
- [[erp/frontend/lib/mes/process.ts|process.ts]] — `PROCESS_LABEL`, `processStageLabel`, `PROCESS_TO_DEPT`, `itemCodeDept`, `itemCodeDeptBadge`, `LEGACY_PART_LABELS`, `displayPart`
- [[erp/frontend/lib/mes/employee.ts|employee.ts]] — `firstEmployeeLetter`
- [[erp/frontend/lib/mes/useFocusTrap.ts|useFocusTrap.ts]] — React 훅. `lib/ui` 컴포넌트 내부 전용

## 도메인 컨텍스트

`color / department / status / transaction` 은 루트 `lib/mes-*` 파일의 re-export 래퍼다. 정본 코드는 아직 루트 파일에 있고, 이 폴더는 진입점 통합 레이어 역할이다 (Round-3~5). `item / inventory / process / employee / colorUtils` 는 Round-10 이후 이 폴더로 정본이 이전됐다.

## ⚠️ 위험 포인트

- `transaction.ts` 의 거래 타입 분류(`TRANSACTION_META`)는 백엔드 `TransactionTypeEnum` 16종과 1:1 대응해야 한다. 백엔드에 새 타입이 추가되면 이 파일도 함께 갱신하지 않으면 라벨/색상이 누락된다.
- `color.ts` 의 `LEGACY_COLORS` 는 CSS 변수 참조이므로 테마 CSS 에서 변수가 정의되지 않으면 빈 값이 된다. 새 테마 추가 시 변수 목록 확인 필수.
- `useFocusTrap.ts` 는 "use client" 서버 컴포넌트에서 import 불가.

## 관련 가이드

- [[erp/_vault/guides/mes-domain]]
