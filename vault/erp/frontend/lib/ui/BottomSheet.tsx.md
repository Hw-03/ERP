---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/BottomSheet.tsx
tags: [vault, code-note, b-tier]
---

# BottomSheet.tsx — 모바일 옵션 시트 (drag-to-dismiss)

> [!summary] 역할
> features/mes/shared에서 lib/ui 이동. ESC/배경 클릭 닫기 + 터치 드래그 아래로 끌면 자동 닫힘(임계값 지정).

## 1. 이 파일의 역할
- BottomSheet 컴포넌트: open/onClose/title/children props
- dismissThresholdPx (기본 96px): 이 거리 이상 끌면 닫힘
- dismissVelocity (기본 0.5px/ms): 이 속도 이상으로 끌면 닫힘
- ESC 키 + 배경 클릭 닫기
- prefers-reduced-motion 시 드래그 추적 유지, 스냅백만 instant (0ms)

## 2. 실제 원본 위치
`frontend/lib/ui/BottomSheet.tsx` — 약 150줄 (drag 로직 포함)

## 3. 주요 import
```typescript
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
```

## 4. 어디서 쓰이는지
- 모바일 옵션 선택/검색 시트
- 모바일 부서 선택, 상태 필터링
- 새 props 미사용 시 기존 동작 완전 동일 (후방호환)

## 5. ⚠️ 위험 포인트
- **터치 좌표 추적** — pointer 이벤트(clientY 변화)에 의존, 터치 종료 시 속도 계산은 마지막 2개 이벤트 기반
- document.body.style.overflow: hidden — 중첩 모달 시 바깥 스크롤 원래대로 복구 안 될 수 있음
- ariaLabel 기본값 "선택 시트" — title 없을 때만 사용

## 6. 수정 전 체크
- open={true} → BottomSheet 보임 확인
- ESC 키 → onClose() 호출 확인
- 배경 클릭 → onClose() 호출 확인
- dismissThresholdPx=100 후 96px 드래그 → 닫히지 않음, 100px → 닫힘 확인
