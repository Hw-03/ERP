---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/models.py
tags: [vault, code-note, backend, router, layer/backend, topic/router, topic/제품모델]
aliases:
  - 제품모델 라우터
---

# 📦 models.py — 제품 모델 슬롯 CRUD

> [!summary] 역할
> `ProductSymbol` 테이블 기반 제품 모델(슬롯)의 목록 조회·신규 등록·삭제를 담당하는 라우터.
> `codes.py`의 슬롯 수정과 달리, 모델 단위로 CRUD를 제공하며 슬롯 자동 배정과 기호(symbol) 자동 생성을 지원한다.

## 1. 이 파일의 역할

제품 모델(`ProductSymbol` 중 `is_reserved=False` 인 실제 모델)을 관리합니다.
`codes.py`가 슬롯의 세부 속성을 변경하는 관리자 도구라면, `models.py`는 "새 모델 추가/삭제"라는
더 단순한 UI 동선을 위한 라우터입니다.
슬롯 번호는 1~100 중 비어 있는 가장 작은 값을 자동으로 배정합니다.

## 2. 실제 원본 위치

- **원본**: `erp/backend/app/routers/models.py` ([[erp/backend/app/routers/models.py]])
- vault 노트는 분석 지도일 뿐, 수정은 원본에서만.

## 3. import 로 가져오는 것

| 모듈 | 역할 |
|---|---|
| `app.models` | `ProductSymbol`, `ItemModel` |
| `app.routers._errors` | `ErrorCode`, `http_error` |
| `app.services._tx` | `commit_and_refresh`, `commit_only` |
| `pydantic.BaseModel` | 로컬 스키마 `ProductModelResponse`, `ProductModelCreate` 정의 |

> [!info] 로컬 스키마
> 이 파일은 `app.schemas` 를 import하지 않고 파일 내부에 `ProductModelResponse`, `ProductModelCreate`를 직접 정의한다. 규모가 작아 별도 분리 없이 인라인으로 처리한 패턴.

## 4. export / 외부에 제공하는 것

- **prefix**: `/api/models`

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/models` | 제품 모델 목록 (is_reserved=False 만) |
| `POST` | `/api/models` | 새 모델 등록 (슬롯·기호 자동 배정) |
| `DELETE` | `/api/models/{slot}` | 모델 삭제 (품목 연결 있으면 409 거부) |

## 5. 이 파일을 참조하는 곳

- `erp/backend/app/main.py` — `app.include_router(models_router.router, prefix="/api/models", tags=["Models"])`
- 프론트엔드 제품 모델 관리 화면 (모델 드롭다운 데이터 소스)
- `erp/backend/app/routers/items.py` — 품목 등록 시 `model_slots` 필드로 연결

## 6. 실제 업무 흐름에서 언제 쓰이는지

- [[시나리오_품목등록]]: 새 제품 라인 추가 → `POST /api/models` → 이후 해당 모델로 품목 등록
- 단종 모델 정리: 연결 품목 없음 확인 후 `DELETE /api/models/{slot}`

## 7. 핵심 함수 / 상수 / 매핑

| 함수 | 설명 |
|---|---|
| `list_models(db)` | `is_reserved=False` + `model_name IS NOT NULL` 필터 |
| `create_model(payload, db)` | 이름 중복 확인 → 빈 슬롯 탐색(1~100) → 기호 자동 생성(A-Z,a-z,0-9 순) |
| `delete_model(slot, db)` | `ItemModel.slot` 사용 건수 확인 → 0이면 삭제, 아니면 409 |

## 8. ⚠️ 위험 포인트

> [!warning] 수정 시 깨지기 쉬운 지점
> - 슬롯 자동 배정(`range(1, 101)`): 100슬롯 모두 채워지면 400 에러. 실제로 채워질 가능성은 낮지만 에러 메시지가 명확하지 않을 수 있음.
> - 기호 자동 생성 순서(`A-Z a-z 0-9`): 62개 후보 모두 사용 중이면 `symbol=None`으로 저장됨 — 후속 코드 생성 시 오류.
> - `delete_model`이 `ItemModel` 테이블만 확인. `Item.symbol_slot` 컬럼을 직접 참조하는 품목이 있다면 고아 데이터 발생 가능.
> - 이 파일에는 `audit.record` 호출이 없다. 모델 추가·삭제가 감사 로그에 기록되지 않음.

[[위험지대_지도]] — 슬롯 고아 데이터, 감사 로그 누락

## 9. 죽은 코드 의심 / 삭제하면 안 되는 이유

- `ProductModelResponse.is_reserved` 필드: 항상 `False` 값으로 반환되지만(필터 결과), 프론트가 이 필드를 읽어 UI 잠금 처리할 수 있으므로 유지.
- `codes.py`의 `update_symbol`과 기능이 일부 겹침. 두 엔드포인트는 UI 컨텍스트(관리자 슬롯 편집 vs 모델 간단 등록)가 다르므로 둘 다 유지.

## 10. 수정 전 체크리스트

- [ ] `verify_local.ps1` 통과 확인
- [ ] 모델 삭제 시 `Item.symbol_slot` 참조 품목 확인 (현재 코드에서 누락)
- [ ] `codes.py`의 `update_symbol`과 충돌 없는지 확인
- [ ] 슬롯 62개 초과 시나리오 고려 (symbol 자동 생성 실패)

## 11. 핵심 코드 발췌

> [!example] 슬롯·기호 자동 배정 로직 (약 25줄)
> ```python
> def create_model(payload: ProductModelCreate, db: Session = Depends(get_db)):
>     existing_name = db.query(ProductSymbol).filter(
>         ProductSymbol.model_name == payload.model_name
>     ).first()
>     if existing_name:
>         raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 모델이 이미 존재합니다.")
>
>     # 다음 빈 slot 찾기 (1~100)
>     used_slots = {ps.slot for ps in db.query(ProductSymbol).all()}
>     next_slot = next((s for s in range(1, 101) if s not in used_slots), None)
>     if next_slot is None:
>         raise http_error(400, ErrorCode.BAD_REQUEST, "슬롯이 모두 사용 중입니다.")
>
>     # symbol 처리: 제공 안 하면 자동 생성
>     symbol = payload.symbol
>     if not symbol:
>         for candidate in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789":
>             if not db.query(ProductSymbol).filter(ProductSymbol.symbol == candidate).first():
>                 symbol = candidate
>                 break
>     else:
>         dup = db.query(ProductSymbol).filter(ProductSymbol.symbol == symbol).first()
>         if dup:
>             raise http_error(409, ErrorCode.CONFLICT, "같은 기호(symbol)의 모델이 이미 존재합니다.")
>
>     ps = ProductSymbol(slot=next_slot, symbol=symbol, model_name=payload.model_name, is_reserved=False)
>     db.add(ps)
>     commit_and_refresh(db, ps)
>     return ps
> ```

빈 슬롯 자동 탐색 + 기호 자동 할당 패턴. 전체 슬롯을 매번 조회해 사용 중인 집합을 만든다.

```mermaid
flowchart LR
    FE["제품 모델 관리 화면"] -->|GET /api/models| R["models.py\nlist_models"]
    FE -->|POST /api/models| C["create_model"]
    C -->|used_slots 계산| DB[("ProductSymbol\n테이블")]
    C -->|중복 확인| DB
    C -->|INSERT| DB
    FE -->|DELETE /api/models/{slot}| D["delete_model"]
    D -->|ItemModel 연결 확인| DB2[("ItemModel\n테이블")]
```

## 관련 노트

- [[처음_읽는_사람]], [[ERP_MOC]], [[용어사전]]
- [[erp/backend/app/routers/codes.py]]
- [[erp/backend/app/models.py]]

Up: [[_routers]]
