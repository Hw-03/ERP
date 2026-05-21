---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app\legacy\_components\_hooks\useFocusTrap.ts
tags: [vault, code-note, b-tier]
---

# useFocusTrap.ts — Wrapper (정본: @/lib/mes/useFocusTrap)

> [!summary] 역할
> Wrapper 파일. 기존 호출처 호환 유지. 정본은 `@/lib/mes/useFocusTrap`.

## 1. 이 파일의 역할
- useFocusTrap re-export (from @/lib/mes/useFocusTrap)
- legacy 코드와의 호환성 유지

## 2. 실제 원본 위치
`frontend/app/legacy/_components/_hooks/useFocusTrap.ts` — 4줄

## 3. 주요 import
```typescript
export { useFocusTrap } from "@/lib/mes/useFocusTrap";
```

## 4. 어디서 쓰이는지
- legacy 컴포넌트들의 기존 import 유지

## 5. ⚠️ 위험 포인트
- **re-export만 수행** — 실제 구현은 @/lib/mes/useFocusTrap에서 확인

## 6. 수정 전 체크
- import 경로 변경 시에만 주의 (breaking change)
