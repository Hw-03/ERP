---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes-department.ts
tags: [vault, code-note, b-tier]
---

# mes-department.ts — 부서 디자인 시스템 (색상/이니셜/정규화)

> [!summary] 역할
> 부서 fallback 색상(DB color_hex 부재 시) + 이니셜 + 정규화. 우선순위: DB > fallback (절대 위반 금지).

## 1. 이 파일의 역할
- MES_DEPARTMENT_COLORS: 부서명 → hex 색상 매핑 (기타="#475569")
- MES_DEPARTMENT_INITIALS: 부서 이니셜 (조="조", 고="고" 등)
- getDepartmentFallbackColor(name) — DB color_hex 없을 때만 사용
- normalizeDepartmentName(), getDepartmentInitial() — alias 처리("연구소" → "연구")
- employeeColor() deprecated → getDepartmentFallbackColor로 대체

## 2. 실제 원본 위치
`frontend/lib/mes-department.ts` — 약 100줄

## 3. 주요 import
없음 (순수 상수/함수)

## 4. 어디서 쓰이는지
- 부서 배지/카드: fallback 색상 결정
- Employee 배지: 부서별 이니셜
- UI 컴포넌트 상속 (color.ts/department.ts re-export)

## 5. ⚠️ 위험 포인트
- **우선순위: DB > fallback (절대 위반 금지)** — 백엔드 Department.color_hex 있으면 그것 우선 사용. 본 모듈은 fallback만 제공
- DEPARTMENT_ALIAS ("연구소" → "연구") — 레거시 호환, 새 데이터는 "연구" 통일 사용
- fallback_color = "#475569" — 미정의 부서 기본값

## 6. 수정 전 체크
- MES_DEPARTMENT_COLORS["조립"] === "#1d4ed8" 확인
- normalizeDepartmentName("연구소") === "연구" 확인
- getDepartmentFallbackColor(undefined 부서) === FALLBACK_COLOR 확인
