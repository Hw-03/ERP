---
type: code-note
project: ERP
layer: backend
source_path: backend/app/utils/erp_code.py
status: active
tags:
  - erp
  - backend
  - utils
  - erp-code
aliases:
  - ERP 코드 생성기
---

# utils/erp_code.py

> [!summary] 역할
> ERP 4-part 코드를 자동으로 생성하는 함수 모음.
> 품목의 카테고리와 레거시 정보를 기반으로 표준화된 코드를 만든다.

> [!info] 주요 책임
> - `make_erp_code(symbol, process_type, serial, option)` — 4파트 코드 조립
> - `infer_process_type(category, legacy_part)` — 카테고리에서 공정 타입 추론
> - `infer_symbol_slot(legacy_model)` — 모델명에서 심볼 슬롯 번호 추론

> [!warning] 주의
> - ERP 코드 구조: `{제품심볼}{공정타입코드}{4자리일련번호}{옵션코드}`
> - 예: `3TR0001` (DX3000 + 튜브원자재 + 1번 + 옵션없음)

---

## 쉬운 말로 설명

**품목 등록 버튼을 누르면 ERP 코드를 자동으로 만들어주는 도구**.

사용자는 "카테고리(TA/HA 등) + 모델(DX3000 등)"만 고르면 이 파일이:
1. 카테고리 → 공정코드 자동 결정 (`TA` → `TA`, `BA/BF` → `AA`, `FG` → `PA`)
2. 원자재(`RM`)의 경우 부서(legacy_part)도 보고 구체화 (`자재창고` → `TR`, `고압파트` → `HR`)
3. 모델 → 슬롯 → 심볼 문자 변환 (`DX3000` → 슬롯 1 → 기호 `3`)
4. 여러 모델 공유 자재면 슬롯들 정렬 이어붙임 (슬롯 3,4,6 → 기호 `346`)
5. DB에서 해당 조합의 최대 serial_no 조회 → +1
6. 4파트로 조립 → `346-AR-0001`

---

## 코드 구조 상세

형식: `{model_symbol}-{process_type}-{serial:04d}[-{option}]`

### 4파트 의미
| 파트 | 예시 | 설명 |
|------|------|------|
| model_symbol | `3`, `346` | 제품기호. 단일(`3`)=해당 제품 전용. 다자리(`346`)=해당 슬롯들에 공유 |
| process_type | `TA`, `PA`, `AR` | 공정 단계 2자 고정. 마스터 테이블(`process_types`)에 정의 |
| serial | `0001` | 해당 (model_symbol, process_type) 조합의 순번. 4자리 제로패딩 |
| option | `BG`, `WM` | 선택적. 옵션(색/포장/사양). 2자 고정 |

### 실제 예시
- `346-AR-0001` = 조립출하용 AR공정, DX3000+ADX4000W+ADX6000에 공용 1호
- `3-PA-0001-BG` = DX3000 완제품(PA) 1호 옵션 BG(검정글로시)
- `3-PA-0012-WM` = DX3000 완제품 12호 옵션 WM(흰색무광)
- `34-TR-0023` = DX3000+ADX4000W 공유 튜브원자재 23호
- `376-TR-0012-BG` = DX3000+COCOON+ADX6000에 공용 튜브원자재 12호 옵션 BG
- `8-AA-0005` = SOLO 최종조립체 5호

---

## 상수 매핑

### `_CATEGORY_TO_PROCESS` (카테고리 → 공정코드)
```
RM → None (legacy_part 보고 판단)
TA → TA,  TF → TA   (튜브 어셈블리/완성)
HA → HA,  HF → HA   (고압)
VA → VA,  VF → VA   (진공)
BA → AA,  BF → AA   (조립)
FG → PA             (최종 완제품)
UK → None           (미분류)
```

### `_PART_TO_PROCESS_FOR_RM` (RM + 부서 → 공정코드)
```
자재창고 → TR    고압파트 → HR    진공파트 → VR
조립출하 → AR    튜닝파트 → AR    출하    → PR
```

### `LEGACY_MODEL_TO_SLOT` (레거시 모델명 → 슬롯 번호)
```
DX3000    → 1       COCOON  → 2       SOLO  → 3
ADX4000W  → 4       ADX6000 → 5       ADX6000FB → 5
```

### `SLOT_TO_SYMBOL` (슬롯 번호 → 심볼 문자)
```
1 → "3"   (DX3000)
2 → "7"   (COCOON)
3 → "8"   (SOLO)
4 → "4"   (ADX4000W)
5 → "6"   (ADX6000FB)
```

슬롯 번호와 심볼 문자가 다른 이유: 슬롯은 내부 관리용 ID(순차), 심볼은 현장에서 외우는 표기(비순차). 예: SOLO는 슬롯3이지만 기호는 8로 표시.

---

## 핵심 함수

### `infer_process_type(category_value, legacy_part) -> str | None`
- 카테고리 값과 레거시 부서명으로 공정코드 결정.
- `RM` + `고압파트` → `HR` 같은 식.
- 매핑 없으면 `None` → 코드 생성 스킵.

### `infer_symbol_slot(legacy_model) -> int | None`
- 레거시 모델명 → 슬롯 번호.
- `DX3000` → `1`, `COCOON` → `2`.
- 매핑 없으면 `None` → 공용 자재로 취급.

### `slots_to_model_symbol(slots: list[int]) -> str`
- 슬롯 번호 리스트를 심볼 문자열로 변환.
- **내부적으로 SLOT_TO_SYMBOL 적용 후 정렬**.
- `[1, 4, 5]` → `"346"` (DX3000의 3 + ADX4000W의 4 + ADX6000의 6).
- 정렬 규칙 덕에 `[5, 1, 4]` 를 넣어도 결과 `"346"` (순서 무관 동일 코드).

### `next_serial_no(model_symbol, process_type, db) -> int`
- `Item.model_symbol == X` 이고 `Item.process_type_code == Y` 인 행들의 최대 `serial_no` + 1.
- 첫 항목이면 1.

### `make_erp_code(model_symbol, process_type, serial_no, option_code=None) -> str`
- 4파트 문자열 조립. 옵션 없으면 3파트.

---

## 생성 흐름 (품목 추가 시)

```
사용자 입력: category=RM, legacy_part=자재창고, legacy_model=DX3000
         ↓
infer_process_type("RM", "자재창고") → "TR"
         ↓
infer_symbol_slot("DX3000") → 1
slots_to_model_symbol([1]) → "3"
         ↓
next_serial_no("3", "TR", db) → 17 (기존 최대가 16이었다면)
         ↓
make_erp_code("3", "TR", 17, None) → "3-TR-0017"
```

---

## FAQ

**Q. 슬롯이 왜 1~5만 있나? 더 쓰려면?**
현재 제품 5종만 정의. `LEGACY_MODEL_TO_SLOT` + `SLOT_TO_SYMBOL` 에 행 추가 + `ProductSymbol` 테이블에 슬롯 등록.

**Q. 공용 자재 `346` 은 어떻게 시리얼이 매겨지나?**
`(model_symbol="346", process_type="AR")` 조합의 최대값 + 1. `3-AR`, `4-AR`, `346-AR` 은 서로 독립 카운터.

**Q. 옵션코드 없는 품목은?**
`option_code=None` 또는 빈 문자열 → 3파트 코드 `3-TR-0017`. 옵션은 선택사항.

**Q. 슬롯 정렬하는 이유?**
`[1,4,5]` 와 `[4,1,5]` 가 같은 공유품인데 코드가 달라지면 중복 등록된다. 정렬로 유일한 표현 강제.

**Q. 레거시 매핑 언제까지 쓰나?**
`seed.py` 에서 초기 데이터 적재 시 주로 사용. 신규 품목은 사용자가 심볼/공정을 직접 선택해 생성 가능(`codes.py` 라우터 `/generate`).

**Q. 심볼이 숫자뿐인 이유?**
`services/codes.py::parse_erp_code` 가 숫자만 허용. 영문 쓰려면 전체 체계 수정 필요.

---

## 관련 문서

- [[backend/app/services/codes.py.md]] — 파싱·검증
- [[backend/app/routers/codes.py.md]] — HTTP 엔드포인트
- [[backend/app/routers/items.py.md]] — 품목 생성 시 호출
- [[backend/app/models.py.md]] — `Item.model_symbol`, `serial_no`, `process_type_code`
- 용어 사전 — ERP 코드 규칙 상세

Up: [[backend/app/utils/utils]]
