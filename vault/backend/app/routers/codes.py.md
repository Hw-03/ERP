---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/codes.py
tags: [vault, code-note, backend, router, layer/backend, topic/router, topic/코드마스터]
aliases:
  - 코드마스터 라우터
---

# 📦 codes.py — 코드 마스터 조회 + 4파트 품목코드 파싱·생성

> [!summary] 역할
> 제품기호(ProductSymbol) 슬롯 관리, 옵션 코드, 공정 코드, 공정 흐름 규칙 조회,
> 그리고 4파트 품목 코드(`[기호][공정][일련번호][옵션]`) 파싱·자동 생성을 담당하는 라우터.

## 1. 이 파일의 역할

DEXCOWIN MES의 품목 코드는 `[제품기호][공정코드][일련번호][옵션코드]` 4파트 구조입니다.
이 파일은 그 코드 체계를 뒷받침하는 마스터 데이터(기호 100슬롯, 옵션, 공정, 흐름 규칙)를 제공하고,
파싱(문자열 → 구조체)과 자동 생성(조건 → 다음 코드 발급) 기능을 노출합니다.

## 2. 실제 원본 위치

- **원본**: `erp/backend/app/routers/codes.py` ([[erp/backend/app/routers/codes.py]])
- vault 노트는 분석 지도일 뿐, 수정은 원본에서만.

## 3. import 로 가져오는 것

| 모듈 | 역할 |
|---|---|
| `app.models` | `ProductSymbol`, `OptionCode`, `ProcessType`, `ProcessFlowRule` |
| `app.schemas` | 요청·응답 DTO 6종 (`ItemCodeGenerateRequest`, `ItemCodeParseRequest`, `ItemCodeResponse` 등) |
| `app.services.audit` | 슬롯 수정 시 감사 로그 |
| `app.services.codes` | `parse_item_code`, `validate_code`, `generate_code` — 핵심 코드 로직 |
| `app.services._tx` | `commit_and_refresh` |

## 4. export / 외부에 제공하는 것

- **prefix**: `/api/codes`

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/codes/symbols` | 제품기호 100슬롯 전체 조회 |
| `PUT` | `/api/codes/symbols/{slot}` | 특정 슬롯 기호/모델명/플래그 수정 |
| `GET` | `/api/codes/options` | 옵션 코드 목록 |
| `GET` | `/api/codes/process-types` | 공정 코드 목록 (18종) |
| `GET` | `/api/codes/process-flows` | 공정 흐름 규칙 목록 |
| `POST` | `/api/codes/parse` | 4파트 코드 문자열 → 구조체 파싱 + DB 유효성 검사 |
| `POST` | `/api/codes/generate` | 조건(기호+공정+옵션) → 다음 코드 자동 생성 |

## 5. 이 파일을 참조하는 곳

- `erp/backend/app/main.py` — `app.include_router(codes.router, prefix="/api/codes", tags=["Codes"])`
- `erp/backend/app/routers/items.py` — 품목 생성 시 `utils/item_code.py` 경유로 간접 연계
- 프론트엔드 품목 등록 폼에서 기호/공정 드롭다운 데이터 소스로 사용

## 6. 실제 업무 흐름에서 언제 쓰이는지

- [[시나리오_품목등록]]: 신규 품목 등록 폼에서 기호 슬롯 목록 로드 → 선택 → `POST /codes/generate`로 코드 미리보기
- 품목 코드 수동 입력 시 `POST /codes/parse`로 형식 유효성 검증
- 관리자가 새 제품 모델 출시 시 슬롯 배정 `PUT /codes/symbols/{slot}`

## 7. 핵심 함수 / 상수 / 매핑

| 함수 | 설명 |
|---|---|
| `list_symbols(db)` | `ProductSymbol` 100행 slot 순 정렬 반환 |
| `update_symbol(slot, payload, request, db)` | 슬롯 수정. 기호 중복 409 차단, symbol+model_name 모두 있으면 is_reserved=False 자동 해제 |
| `parse_code(payload, db)` | `code_svc.parse_item_code` → `code_svc.validate_code` 호출. 실패 시 400 |
| `generate_code(payload, db)` | `code_svc.generate_code` 호출. 다음 serial_no 계산 포함 |

## 8. ⚠️ 위험 포인트

> [!warning] 수정 시 깨지기 쉬운 지점
> - 슬롯 수정 시 `is_reserved` 자동 해제 로직: symbol과 model_name 둘 다 있을 때만 해제. 조건 변경 시 이미 배정된 슬롯이 예약 상태로 잠길 수 있음.
> - 기호 중복 체크: 동일 symbol이 다른 slot에 있으면 409. 대소문자 구분 여부를 DB collation 설정이 결정함 (SQLite는 기본 case-sensitive).
> - `generate_code`는 현재 DB 최대 serial_no +1을 발급. 동시 요청 시 동일 코드가 발급될 수 있음 — 최종 중복 방지는 Item 테이블의 unique 제약에 의존.

[[위험지대_지도]] — 코드 자동 발급 race condition

## 9. 죽은 코드 의심 / 삭제하면 안 되는 이유

- `list_process_flows`: 현재 UI에서 사용하는지 불분명하지만, 공정 흐름 규칙 유효성 검사에 필요 데이터를 제공하므로 유지.
- `validate_code` 호출 (`parse_code` 내부): 단순 파싱이 아니라 DB 내 기호·공정 존재 여부까지 검사. 삭제 시 존재하지 않는 코드가 통과됨.

## 10. 수정 전 체크리스트

- [ ] `verify_local.ps1` 통과 확인
- [ ] `tests/` 코드 파싱 관련 테스트 확인
- [ ] 슬롯 수정 시 `items.py`의 `item_code` 자동 생성 로직과 일관성 확인
- [ ] `generate_code` 결과가 `items.py`의 `make_item_code` 결과와 동일 형식인지 확인

## 11. 핵심 코드 발췌

> [!example] 슬롯 수정 + 중복 체크 + is_reserved 자동 해제 (약 25줄)
> ```python
> @router.put("/symbols/{slot}", response_model=ProductSymbolResponse)
> def update_symbol(slot: int, payload: ProductSymbolUpdate, request: Request, db: Session = Depends(get_db)):
>     row = db.query(ProductSymbol).filter(ProductSymbol.slot == slot).one_or_none()
>     if row is None:
>         raise http_error(404, ErrorCode.NOT_FOUND, "해당 슬롯이 없습니다.")
>
>     if payload.symbol is not None:
>         dup = (
>             db.query(ProductSymbol)
>             .filter(ProductSymbol.symbol == payload.symbol, ProductSymbol.slot != slot)
>             .one_or_none()
>         )
>         if dup is not None:
>             raise http_error(
>                 status.HTTP_409_CONFLICT, ErrorCode.CONFLICT,
>                 f"기호 '{payload.symbol}' 는 이미 슬롯 {dup.slot}에 사용 중입니다.",
>             )
>         row.symbol = payload.symbol
>
>     if payload.model_name is not None:
>         row.model_name = payload.model_name
>
>     # If symbol or model assigned, unlock reservation flag
>     if row.symbol and row.model_name:
>         row.is_reserved = False
>
>     audit.record(db, request=request, action="codes.symbol_update", ...)
>     commit_and_refresh(db, row)
>     return row
> ```

슬롯에 symbol과 model_name이 모두 채워지면 예약 상태(`is_reserved`)를 자동으로 해제한다.

```mermaid
flowchart LR
    FE["품목 등록 폼"] -->|GET /api/codes/symbols| R["codes.py"]
    FE -->|POST /api/codes/generate| R
    R -->|parse_item_code| SVC["services/codes.py"]
    R -->|generate_code| SVC
    SVC -->|next serial_no| DB[("ProductSymbol\nProcessType\nOptionCode")]
    R -->|PUT /symbols/{slot}| audit["services/audit.py"]
```

## 관련 노트

- [[처음_읽는_사람]], [[ERP_MOC]], [[용어사전]]
- [[erp/backend/app/services/codes.py]]
- [[erp/backend/app/utils/item_code.py]]
- [[erp/backend/app/models.py]]

Up: [[_routers]]
