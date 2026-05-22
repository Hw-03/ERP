---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-02-backend-fix-plan.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-02-backend-fix-plan.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-02-backend-fix-plan.md]]

## 원본 첫 줄 (또는 메타)

```
# 백엔드 수정안 — 2026-05-02

> **작업 ID:** MES-BE-001~006
> **작성일:** 2026-05-02 (토)
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (계획 문서만, 실제 수정은 회사 PC)

---

## MES-BE-001 — `update_item` + `process_type_code` 누락 버그

### 현상

품목 마스터 화면에서 `process_type_code` 변경 시 저장되지 않음.

### 원인

| 위치 | 문제 |
|---|---|
| `backend/app/schemas.py:41-51` (`ItemUpdate`) | `process_type_code` 필드 자체가 없음 |
| `backend/app/routers/items.py:415-444` (`update_item`) | 10개 필드 루프 돌리는데 `process_type_code` 미포함 |

### 수정안

```python
```
