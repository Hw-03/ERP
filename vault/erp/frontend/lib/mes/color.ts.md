---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/color.ts
tags: [vault, code-note, b-tier]
---

# color.ts — MES 색상 토큰 진입점

> [!summary] 역할
> CSS 변수(light/dark 테마) 17종 토큰 + 옵션 코드 색상(BG/WM/SV) + 부서 색상 진입점. Round-10D 정본 통합.

## 1. 이 파일의 역할
- LEGACY_COLORS — CSS 변수 참조 (var(--c-bg) 등). 인라인 style 사용처에서 필수
- OPTION_COLOR — BG: "#60a5fa", WM: "#f97316", SV: ... 옵션별 색상
- getDepartmentFallbackColor, getDepartmentInitial, normalizeDepartmentName re-export (from mes-department)
- white: "#ffffff" (accent foreground용, 테마 무관)

## 2. 실제 원본 위치
`frontend/lib/mes/color.ts` — 약 50줄

## 3. 주요 import
```typescript
import { getDepartmentFallbackColor } from "../mes-department";
export { ... } from "../mes-department";
```

## 4. 어디서 쓰이는지
- UI 컴포넌트: BottomSheet, ConfirmModal, Toast, StatusPill 등
- 부서 배지/카드 색상
- 옵션 코드 라벨 색상 매핑
- 사용: `style={{ background: LEGACY_COLORS.s1 }}`

## 5. ⚠️ 위험 포인트
- **CSS 변수는 runtime 에서만 값 결정** — SSR 시 fallback 없음 (CSS 파일 로드 전 렌더링되면 undefined)
- OPTION_COLOR 값이 특정 옵션에만 정의 — 미정의 옵션은 undefined 반환 (컴포넌트에서 처리 필수)
- getDepartmentFallbackColor는 네트워크 없이 작동 — DB color_hex 우선 사용 (로직은 mes-department에서)

## 6. 수정 전 체크
- LEGACY_COLORS.s1 === "var(--c-s1)" 확인
- OPTION_COLOR["BG"] === "#60a5fa" 확인
- re-export된 함수 (getDepartmentFallbackColor 등) 사용 가능 확인
