---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/Toast.tsx
tags: [vault, code-note, b-tier]
---

# Toast.tsx — 알림 토스트 (success/error/info)

> [!summary] 역할
> 화면 상단 2800ms 자동 닫힘 토스트. 타입별 색상(초록/빨강/파랑) + left border 3px.

## 1. 이 파일의 역할
- ToastState: { message, type: "success" | "error" | "info" }
- 2800ms 타이머 자동 닫힘 (타이머 초기화 시 clearTimeout)
- 타입별 left border 색상 + ARIA role/aria-live 설정
- 고정 위치: left:50% top:(safe-area-inset-top + 54px)

## 2. 실제 원본 위치
`frontend/lib/ui/Toast.tsx` — 약 60줄

## 3. 주요 import
```typescript
import { useEffect } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
```

## 4. 어디서 쓰이는지
- API 응답 성공/실패 피드백
- 폼 제출 결과 알림
- 부서 조정 완료/오류 메시지

## 5. ⚠️ 위험 포인트
- **2800ms 고정** — 사용자가 읽기 전에 닫힐 수 있음 (long message는 문제)
- ARIA role="alert" (error) vs role="status" (success/info) — 스크린 리더 동작 차이 확인 필수
- pointer-events-none + max-width:402px — 매우 긴 메시지는 넘침

## 6. 수정 전 체크
- toast={{ message: "성공", type: "success" }} 렌더링 후 2.8초 자동 닫힘 확인
- 타입별 left border 색상 확인
- onClose() 호출되는지 확인
