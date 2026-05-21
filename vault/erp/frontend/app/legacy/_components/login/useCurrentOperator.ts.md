---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/useCurrentOperator.ts
tags: [vault, code-note, b-tier]
---

# useCurrentOperator.ts — localStorage 기반 로그인 상태 관리

> [!summary] 역할
> Operator (로그인된 작업자) 정보를 localStorage에 저장/조회. CustomEvent 같은 탭 알림 + 다른 탭 storage 이벤트.

## 1. 이 파일의 역할
- Operator: { employee_id, name, department, level, warehouse_role, department_role, theme?, assigned_model_slots[] }
- readCurrentOperator() — localStorage에서 Operator 조회, 폴백 처리
- setCurrentOperator(op) — localStorage + CustomEvent 발화
- useCurrentOperator() hook — state + 구독 (storage/CustomEvent 리스너)
- clearCurrentOperator() — logout (remove from localStorage)
- getStoredBootId() — boot ID(재인증용?) 조회

## 2. 실제 원본 위치
`frontend/app/legacy/_components/login/useCurrentOperator.ts` — 약 150줄

## 3. 주요 import
```typescript
import { useEffect, useState } from "react";
import type { Department, DepartmentRole, EmployeeLevel, WarehouseRole } from "@/lib/api";
```

## 4. 어디서 쓰이는지
- MesLoginGate: 인증 상태 확인/유지
- OperatorLoginCard: setCurrentOperator 호출
- 앱 전역: useCurrentOperator 구독 (로그인된 작업자 정보 사용)

## 5. ⚠️ 위험 포인트
- **localStorage 직접 write** — XSS 취약성 시 Operator 정보 탈취 가능
- warehouse_role/department_role 누락 시 "none" 폴백 — 권한 검증 필수
- assigned_model_slots은 배열, 숫자만 필터링 (다른 타입 무시) — 유효성 검사 미흡
- CustomEvent와 storage 이벤트 이중 처리 — 성능 영향은 미미하지만 중복 가능

## 6. 수정 전 체크
- setCurrentOperator({ employee_id: "E01", ... }) → localStorage에 저장 확인
- useCurrentOperator() hook → 같은 탭 구독자 갱신 확인
- 다른 탭에서 logout → storage 이벤트 → 현재 탭 state 초기화 확인
- theme/assigned_model_slots 누락 → 기본값 null/[] 확인
