---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/ConfirmModal.tsx
tags: [vault, code-note, b-tier]
---

# ConfirmModal.tsx — 확인 대화 (경고/위험/일반)

> [!summary] 역할
> 사용자 확인 모달. tone(normal/caution/danger)에 따라 아이콘/색상 변화. busy 상태로 처리 중 표시 지원.

## 1. 이 파일의 역할
- ConfirmTone: "normal" | "caution" | "danger"
- TONE_ACCENT: 톤별 색상 (blue/yellow/red)
- Props: open/title/onConfirm/cautionMessage/busy/busyLabel/confirmAccent 등
- 기본값: confirmLabel="확인", cancelLabel="취소", busyLabel="처리 중..."
- busy=true 시 확인 버튼 disabled + 스피너

## 2. 실제 원본 위치
`frontend/lib/ui/ConfirmModal.tsx` — 약 100줄

## 3. 주요 import
```typescript
import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
```

## 4. 어디서 쓰이는지
- 거래 삭제/수정 확인 (danger)
- 재고 조정 확인 (caution)
- 일반 작업 확인 (normal)

## 5. ⚠️ 위험 포인트
- **onConfirm이 Promise를 반환하면 자동으로 busy 전환** — async 함수 지원하지만 명시적 busy=true 설정 필요할 수 있음
- AlertTriangle 아이콘은 caution/danger 톤에만 표시 (normal 톤은 아이콘 없음)
- createPortal로 렌더링 — 부모 overflow:hidden 무시됨 (의도적)

## 6. 수정 전 체크
- tone="danger" → 빨간 accent 색상 확인
- cautionMessage 있을 때 화면에 표시 확인
- busy=true → 확인 버튼 disabled 확인
