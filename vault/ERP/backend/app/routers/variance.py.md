---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/variance.py
tags: [vault, code-note, backend, router, layer/backend, topic/router, topic/차이분석, topic/BOM]
aliases:
  - 분산로그 라우터
  - Variance 라우터
---

# 📦 variance.py — BOM 예상 vs 실제 사용량 차이 로그 조회 (읽기 전용)

> [!summary] 역할
> BOM에서 기대한 소비량과 실제 사용량의 차이(`diff`)를 기록한 `VarianceLog` 를 조회하는 라우터.
> 쓰기 기능 없이 읽기 전용(GET only)이며, 이 데이터는 `dept_adjustment.py`의 submit 시 서비스 레이어에서 기록된다.

## 1. 이 파일의 역할

현장에서 부품을 "BOM대로 10개 써야 하는데 실제로 12개 썼다"는 차이를 추적합니다.
이 파일은 그 차이 기록(`VarianceLog`)을 조회하는 단 하나의 엔드포인트만 가집니다.
포인트: **이 파일은 로그를 쓰지 않고, 오직 읽기만 합니다.**
로그 생성은 `services/dept_adjustment.py` 안에서 이뤄집니다.

## 2. 실제 원본 위치

- **원본**: `erp/backend/app/routers/variance.py` ([[erp/backend/app/routers/variance.py]])
- vault 노트는 분석 지도일 뿐, 수정은 원본에서만.

## 3. import 로 가져오는 것

| 모듈 | 역할 |
|---|---|
| `app.database` | `get_db` |
| `app.models` | `VarianceLog`, `Item` |
| `app.schemas` | `VarianceLogResponse` |

> [!info] 가장 단순한 라우터
> `_errors`, `audit`, `_tx` 등 보조 모듈을 전혀 import하지 않는다. 읽기 전용이라 트랜잭션 변경도 없고, 에러는 404 없이 빈 목록으로 처리한다.

## 4. export / 외부에 제공하는 것

- **prefix**: `/api/variance`

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/variance` | VarianceLog 조회 (품목 필터 + 페이징) |

## 5. 이 파일을 참조하는 곳

- `erp/backend/app/main.py` — `app.include_router(variance.router, prefix="/api/variance", tags=["Variance"])`
- 프론트엔드 차이 분석 화면 (관리자 리포트)
- `VarianceLog` 데이터는 `erp/backend/app/services/dept_adjustment.py` 에서 생성됨

## 6. 실제 업무 흐름에서 언제 쓰이는지

- [[시나리오_생산배치]] 완료 후 관리자가 "BOM 대비 실제 소비 차이"를 분석할 때
- [[시나리오_분해반품]] 후 회수량이 예상과 다를 때 원인 파악

## 7. 핵심 함수 / 상수 / 매핑

| 함수 | 설명 |
|---|---|
| `list_variance(item_id, skip, limit, db)` | `VarianceLog` 조회 + 품목별 필터. `_to_response`로 Item 이름 조회 포함 |
| `_to_response(db, log)` | `VarianceLog` → `VarianceLogResponse`. Item 단건 쿼리 포함 (N+1 잠재) |

> [!question] N+1 잠재
> `_to_response`가 `VarianceLog` 1건당 `Item` 1번 조회함. 현재 페이징 한계(500)가 있어 실용상 문제는 작지만, 대량 조회 시 최적화 고려 필요.

## 8. ⚠️ 위험 포인트

> [!warning] 수정 시 깨지기 쉬운 지점
> - `_to_response` 내부의 N+1: `list_variance`가 rows 목록 전체를 `[_to_response(db, r) for r in rows]`로 처리하므로 500건이면 DB 쿼리 500번 + 1번 발생.
> - `item_id` 필터가 옵션이지만, 필터 없이 호출하면 최대 500건 전체를 조회 → 위의 N+1과 합산.
> - `VarianceLog`에 item이 삭제된 경우(`item`이 None): `item.item_code if item else None` 패턴으로 안전 처리됨 — Item FK가 nullable이거나 CASCADE DELETE 없으면 고아 로그 발생 가능.

[[위험지대_지도]] — N+1 쿼리 패턴, 고아 로그

## 9. 죽은 코드 의심 / 삭제하면 안 되는 이유

- 이 파일 전체: 기능이 단순해 "없애도 되지 않나" 싶을 수 있지만, 공정 품질 관리 관점에서 BOM vs 실제 소비 추적은 MES 핵심 기능 중 하나. 반드시 유지.
- `VarianceLogResponse`의 `diff` 필드: 단순 `bom_expected - actual_used`이지만 부호(양수/음수)가 "초과 소비" vs "절약" 방향을 나타냄. 삭제하면 의미 손실.

## 10. 수정 전 체크리스트

- [ ] `verify_local.ps1` 통과 확인
- [ ] 조회 건수가 커지면 N+1 최적화 고려 (item_ids IN 1회로 일괄 조회)
- [ ] `VarianceLog` 생성 로직인 `services/dept_adjustment.py` 수정 시 응답 shape 일치 확인
- [ ] `diff` 계산 부호 방향(`bom_expected - actual_used`) 프론트와 동일 방향인지 확인

## 11. 핵심 코드 발췌

> [!example] 전체 구현 (파일이 작아 핵심이 전체) (약 30줄)
> ```python
> def _to_response(db: Session, log: VarianceLog) -> VarianceLogResponse:
>     item = db.query(Item).filter(Item.item_id == log.item_id).first()
>     return VarianceLogResponse(
>         var_id=log.var_id,
>         item_id=log.item_id,
>         item_code=item.item_code if item else None,
>         item_name=item.item_name if item else None,
>         bom_expected=log.bom_expected,
>         actual_used=log.actual_used,
>         diff=log.diff,
>         note=log.note,
>         created_at=log.created_at,
>     )
>
> @router.get("", response_model=List[VarianceLogResponse], summary="Variance 로그 조회")
> def list_variance(
>     item_id: Optional[uuid.UUID] = Query(None),
>     skip: int = Query(0, ge=0),
>     limit: int = Query(100, ge=1, le=500),
>     db: Session = Depends(get_db),
> ):
>     q = db.query(VarianceLog)
>     if item_id:
>         q = q.filter(VarianceLog.item_id == item_id)
>     rows = q.order_by(VarianceLog.created_at.desc()).offset(skip).limit(limit).all()
>     return [_to_response(db, r) for r in rows]
> ```

`_to_response`는 로그 1건당 Item을 1번씩 DB에서 가져온다(N+1). 소량에는 문제 없지만 대량 리포트에서는 최적화가 필요하다.

```mermaid
flowchart LR
    WRITE["services/dept_adjustment.py\nsubmit 시 VarianceLog 생성"]
    DB[("VarianceLog\n테이블")]
    R["variance.py\nlist_variance(GET only)"]
    FE["관리자\n차이 분석 화면"]

    WRITE -->|INSERT| DB
    FE -->|GET /api/variance| R
    R -->|SELECT VarianceLog| DB
    R -->|SELECT Item (N+1)| DB
    R -->|VarianceLogResponse 목록| FE
```

## 관련 노트

- [[처음_읽는_사람]], [[ERP_MOC]], [[용어사전]]
- [[erp/backend/app/services/dept_adjustment.py]]
- [[erp/backend/app/routers/dept_adjustment.py]]
- [[erp/backend/app/models.py]]

Up: [[_routers]]
