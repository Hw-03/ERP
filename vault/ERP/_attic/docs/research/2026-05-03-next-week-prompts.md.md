---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-03-next-week-prompts.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-03-next-week-prompts.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-03-next-week-prompts.md]]

## 원본 첫 줄 (또는 메타)

```
# 다음 주 프롬프트 패키지 — 2026-05-03

> **작업 ID:** MES-QA-003
> **작성일:** 2026-05-03 (일)
> **목적:** 회사 PC 첫 주 (월~금) 에 그대로 복사해서 쓸 수 있는 프롬프트 모음
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (프롬프트 템플릿)

---

## 사용법

각 프롬프트는 독립적으로 클로드에게 던질 수 있도록 자기완결로 작성됨.
- 작업 ID, 변경 파일, 검증 절차, 커밋 메시지 모두 포함
- 위험도 표기로 자가검열 가능

---

## P-MON-01 — `update_item` `process_type_code` 누락 수정 (BE-001)

```
DEXCOWIN MES, feat/hardening-roadmap.

backend/app/schemas.py 의 ItemUpdate 클래스에 process_type_code: Optional[str] = None 필드를 추가해라.
backend/app/routers/items.py 의 update_item 함수 업데이트 루프에 "process_type_code" 를 추가해라.
```
