---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes-status.ts
tags: [vault, code-note, b-tier]
---

# mes-status.ts — 상태 톤/거래 타입 통합 매핑

> [!summary] 역할
> MesTone (success/warning/danger/info/neutral/muted) 중앙 정의. StatusPill/StatusBadge 호환 (old "ok"/"warn" → new MesTone).

## 1. 이 파일의 역할
- MesTone: "success" | "warning" | "danger" | "info" | "neutral" | "muted"
- toMesTone(value?) — 문자열 → MesTone (ok/warn → success/warning alias 포함)
- inferTone(status: string) — 자유 텍스트 상태 → MesTone 추론
- TRANSACTION_META: 거래 16종 (RECEIVE/MOVE/... 각 라벨/톤/아이콘)
- getTransactionLabel/Tone, transactionIconName, transactionColor

## 2. 실제 원본 위치
`frontend/lib/mes-status.ts` — 약 150줄

## 3. 주요 import
```typescript
import type { TransactionType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
```

## 4. 어디서 쓰이는지
- StatusPill/StatusBadge 톤 설정
- 거래 목록 아이콘/색상 표시
- mes/status.ts, mes/transaction.ts re-export 대상

## 5. ⚠️ 위험 포인트
- **TRANSACTION_META는 고정 16종** — 백엔드 TransactionTypeEnum과 항상 일치해야 함. 새 거래 타입 추가 시 양쪽 동시 수정 필수
- inferTone() — "재고 부족", "생산 중" 같은 자유 텍스트 → tone 추론. 규칙 불명확 (문서 확인 필수)
- toMesTone 기본값 "info" — 미매핑 값은 모두 info로 떨어짐

## 6. 수정 전 체크
- toMesTone("ok") === "success" 확인
- toMesTone(null) === "info" 확인
- TRANSACTION_META 모든 거래 타입에 label/tone/iconName 있는지 확인
