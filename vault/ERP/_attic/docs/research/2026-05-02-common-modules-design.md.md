---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-02-common-modules-design.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-02-common-modules-design.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-02-common-modules-design.md]]

## 원본 첫 줄 (또는 메타)

```
# 공통 모듈 설계 — 2026-05-02

> **작업 ID:** MES-COMP-002~005  
> **작성일:** 2026-05-02 (토)  
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)  
> **수정 여부:** 없음 (설계 문서만, 실제 생성은 회사 PC)

---

## MES-COMP-002 — StatusPill / StatusBadge 통합 설계

### 현재 두 컴포넌트 비교

| 항목 | `common/StatusPill.tsx` | `mobile/primitives/StatusBadge.tsx` |
|---|---|---|
| Tone 타입 | `"info" \| "success" \| "warning" \| "danger" \| "neutral"` | `"ok" \| "warn" \| "danger" \| "info" \| "muted"` |
| 공통 | `info`, `danger` | `info`, `danger` |
| 차이 | `success`, `warning`, `neutral` | `ok`, `warn`, `muted` |
| 스타일 | Tailwind 클래스 내부 | Tailwind 클래스 내부 |
| 사용처 | 데스크톱 전반 | 모바일 전반 |

### Tone 통합 매핑

```ts
// 통합 타입 (mes-status.ts)
```
