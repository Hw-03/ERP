---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/EmployeeCombobox.tsx
tags: [vault, code-note, b-tier]
---

# EmployeeCombobox.tsx — 직원 검색 콤보박스

> [!summary] 역할
> employees[] → query 필터링 → 키보드 네비게이션 (ArrowUp/Down/Enter). 부서/직원코드로도 검색 가능.

## 1. 이 파일의 역할
- EmployeeComboboxProps: { employees, value, onChange, autoFocus?, disabled? }
- query: 검색어 (이름/부서/직원코드 모두 매칭)
- active: 현재 활성 아이템 인덱스 (키보드 네비게이션)
- open: 드롭다운 열림/닫힘
- ArrowUp/Down/Enter/Escape 키보드 핸들러

## 2. 실제 원본 위치
`frontend/app/legacy/_components/login/EmployeeCombobox.tsx` — 약 120줄

## 3. 주요 import
```typescript
import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent
} from "react";
import { ChevronDown, User as UserIcon } from "lucide-react";
import type { Employee } from "@/lib/api";
```

## 4. 어디서 쓰이는지
- OperatorLoginCard: 작업자 선택
- 다른 직원 검색 UI

## 5. ⚠️ 위험 포인트
- **query trim + toLowerCase** — 선행/후행 공백 제거되지만, 일부 검색은 부분 매칭
- employees 배열이 바뀌면 query는 유지 — 필터 결과 달라질 수 있음
- listRef.current?.children[active] 로 스크롤 위치 추적 — 존재하지 않는 인덱스 접근 가능
- disabled=true → 여전히 state 업데이트 가능 (UI만 disabled, 로직은 실행)

## 6. 수정 전 체크
- query="김" → filtered에 "김"이 포함된 직원만 확인
- query="조립" → 부서 매칭도 작동 확인
- ArrowDown → active 증가, ArrowUp → active 감소 확인
- Enter → onChange(filtered[active]) 호출 확인
