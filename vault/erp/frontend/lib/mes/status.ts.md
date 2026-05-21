---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/status.ts
tags: [vault, code-note, b-tier]
---

# status.ts — MES 상태/거래 톤 모듈 진입점

> [!summary] 역할
> `@/lib/mes-status` thin re-export. MesTone, toMesTone, inferTone, TRANSACTION_META 등 상태 톤 유틸 진입점.

## 1. 이 파일의 역할
- mes-status.ts의 거래/상태 관련 모든 export 재제공
- Round-3: thin re-export, Round-4+ 추가 분리(transaction별도) 검토

## 2. 실제 원본 위치
`frontend/lib/mes/status.ts` — 7줄

## 3. 주요 import
```typescript
export * from "../mes-status";
```

## 4. 어디서 쓰이는지
- `import { MesTone, TRANSACTION_META } from "@/lib/mes/status"`
- 거래 타입별 아이콘/색상 표시

## 5. ⚠️ 위험 포인트
- **thin re-export** — 정본은 mes-status.ts
- 향후 transaction 분리 시 breaking change

## 6. 수정 전 체크
- import 가능 여부만 확인
