---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/department.ts
tags: [vault, code-note, b-tier]
---

# department.ts — MES 부서 모듈 진입점 (thin re-export)

> [!summary] 역할
> `@/lib/mes-department`의 부서 유틸(색상/이니셜/정규화) 진입점. Round-3 구조에서 Round-4+ 본문 이전 대비.

## 1. 이 파일의 역할
- thin re-export: MES_DEPARTMENT_COLORS, getDepartmentFallbackColor, getDepartmentInitial, normalizeDepartmentName 모두
- 현재 본문 없음 — 모두 mes-department.ts에서 제공
- 미래에 본 파일이 정본이 될 계획

## 2. 실제 원본 위치
`frontend/lib/mes/department.ts` — 8줄

## 3. 주요 import
```typescript
export * from "../mes-department";
```

## 4. 어디서 쓰이는지
- `import { ... } from "@/lib/mes/department"` 호출처
- 부서별 색상/이니셜 필요한 컴포넌트

## 5. ⚠️ 위험 포인트
- **re-export만 수행** — 타입 정의가 여기 없음 (TypeScript 네비게이션 시 mes-department로 점프)
- 추후 본문 이전 시 import 경로 변경 필수 (breaking change)

## 6. 수정 전 체크
- import { MES_DEPARTMENT_COLORS } from "@/lib/mes/department" 가능 확인
- 타입 정의도 re-export되는지 확인
