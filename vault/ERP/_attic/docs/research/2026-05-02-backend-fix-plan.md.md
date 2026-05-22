---
type: file-explanation
source_path: "_attic/docs/research/2026-05-02-backend-fix-plan.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-02-backend-fix-plan.md — 2026-05-02-backend-fix-plan.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-02-backend-fix-plan.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `백엔드 수정안 — 2026-05-02`
- `MES-BE-001 — `update_item` + `process_type_code` 누락 버그`
- `현상`
- `원인`
- `수정안`
- `schemas.py — ItemUpdate에 추가`
- `items.py — update_item 루프에 추가`
- `검증 절차 (회사 PC)`
- `실제 라우트: backend/app/routers/items.py 의 @router.put("/{item_id}")`
- `→ 메서드는 PUT (PATCH 아님)`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
# schemas.py — ItemUpdate에 추가
class ItemUpdate(BaseModel):
    item_name: Optional[str] = None
    spec: Optional[str] = None
    unit: Optional[str] = None
    barcode: Optional[str] = None
    min_stock: Optional[int] = None
    process_type_code: Optional[str] = None   # ← 추가
    # ... 기존 필드 유지
```

```python
# items.py — update_item 루프에 추가
for field in (
    "item_name", "spec", "unit", "barcode", "min_stock",
    "process_type_code",   # ← 추가
    # ... 기존 필드
):
    value = getattr(payload, field, None)
    if value is not None:
        setattr(item, field, value)
```

### 검증 절차 (회사 PC)

```bash
# 실제 라우트: backend/app/routers/items.py 의 @router.put("/{item_id}")
# → 메서드는 PUT (PATCH 아님)

# 1) 변경 전 baseline
```
