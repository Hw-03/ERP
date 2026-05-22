---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/DepartmentsContext.tsx
tags: [vault, code-note, frontend, b-tier]
---

# DepartmentsContext — 부서 마스터 context

> [!summary] 역할
> 부서 목록 전역 관리. getColor 콜백으로 부서명 → 색상 매핑.

## 1. 이 파일의 역할

React Context로 부서 데이터 공유. DepartmentsProvider로 트리 감싸기, useDeptColorLookup/useDeptColor hook으로 색상 조회. api.getDepartments() 호출, inflightRef로 중복 요청 방지. employeeColor utility로 색상 생성.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/DepartmentsContext.tsx` ([[erp/frontend/app/legacy/_components/DepartmentsContext.tsx|原本]])

## 3. 주요 import

- React: `createContext`, `useCallback`, `useContext`, `useEffect`, `useMemo`, `useRef`, `useState`, `ReactNode`
- `api`, `DepartmentMaster` from `@/lib/api`
- `employeeColor` from `@/lib/mes/color`
- `normalizeDepartment` from `@/lib/mes/department`

## 4. 어디서 쓰이는지

- DesktopLegacyShell 상위에서 <DepartmentsProvider>로 감싸기
- 모든 legacy 컴포넌트에서 useDeptColor/useDeptColorLookup 사용

## 5. ⚠️ 위험 포인트

> [!warning] inflightRef로 요청 중복 방지 — 비동기 race condition
> api.getDepartments 실패 → 빈 배열 처리

## 6. 수정 전 체크

- [ ] DepartmentMaster 구조 변경 시 getColor 로직 갱신
- [ ] refresh 호출 타이밍(mount vs 조건부) 검증
