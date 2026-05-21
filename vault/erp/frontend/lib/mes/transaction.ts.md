---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/transaction.ts
tags: [vault, code-note, b-tier]
---

# transaction.ts — MES 거래(Transaction) 모듈

> [!summary] 역할
> mes-status.ts의 거래 관련 export를 명시적 진입점에 묶기. 타입/라벨/톤/아이콘 한 곳에서 조회.

## 1. 이 파일의 역할
- TransactionMeta, TransactionIconName 타입 export
- TRANSACTION_META (거래 16종 메타)
- getTransactionLabel, getTransactionTone, transactionIconName, transactionColor 함수

## 2. 실제 원본 위치
`frontend/lib/mes/transaction.ts` — 22줄

## 3. 주요 import
```typescript
export type { TransactionMeta, TransactionIconName } from "../mes-status";
export { TRANSACTION_META, getTransactionLabel, ... } from "../mes-status";
```

## 4. 어디서 쓰이는지
- 거래 목록/상세: 타입별 라벨/아이콘/색상 조회
- 거래 필터 (TRANSACTION_META 순회)

## 5. ⚠️ 위험 포인트
- **메타는 mes-status에서 정본** — 변경 시 그곳만 수정
- 16종 거래 타입이 일정한가? (백엔드 TransactionTypeEnum과 싱크 필수)

## 6. 수정 전 체크
- import { TRANSACTION_META } from "@/lib/mes/transaction" 가능 확인
- TRANSACTION_META 모든 항목이 라벨/톤/아이콘을 가지는지 확인
