---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/format.ts
tags: [vault, code-note, b-tier]
---

# format.ts — MES 포맷 모듈 진입점

> [!summary] 역할
> `@/lib/mes-format` thin re-export. 숫자/날짜/시간 포맷 함수 진입점.

## 1. 이 파일의 역할
- mes-format.ts 의 모든 export 재제공 (부서명/거래타입/수량 포맷 등)
- Round-3: 현재 thin re-export만, 향후 본문 이전 또는 추가 모듈 도입 시 이 파일이 정본

## 2. 실제 원본 위치
`frontend/lib/mes/format.ts` — 7줄

## 3. 주요 import
```typescript
export * from "../mes-format";
```

## 4. 어디서 쓰이는지
- `import { ... } from "@/lib/mes/format"` 호출처
- 템플릿에서 수량/날짜 표시

## 5. ⚠️ 위험 포인트
- **thin re-export** — 정본은 mes-format.ts
- 추후 분리 시 breaking change

## 6. 수정 전 체크
- import 가능 여부만 확인 (내용은 mes-format 참고)
