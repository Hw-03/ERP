---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/codes.py
status: active
tags:
  - erp
  - backend
  - router
  - codes
aliases:
  - ERP 코드 라우터
---

# codes.py

> [!summary] 역할
> ERP 4-part 코드 체계(제품 심볼, 옵션 코드, 공정 타입, 흐름 규칙)를 조회하는 API.

> [!info] 주요 책임
> - 제품 심볼(ProductSymbol) 목록 조회 — 모델별 슬롯 번호
> - 옵션 코드(OptionCode) 목록 조회 — 색상/마감 코드
> - 공정 타입(ProcessType) 목록 조회 — TR/TA/HR/HA 등
> - 공정 흐름 규칙(ProcessFlowRule) 조회

> [!warning] 주의
> - 이 데이터는 `main.py`에서 초기 시드로 생성됨
> - ERP 코드 구조: `{심볼}-{공정타입}-{일련번호}-{옵션코드}`

---

## 쉬운 말로 설명

이 라우터는 **"ERP 코드의 4가지 구성요소 참조"** 및 **"코드 파싱·생성 유틸"**. 화면 드롭다운·선택기에 코드 후보를 뿌려주고, 임의 문자열을 파싱·검증하거나 새 코드를 생성한다.

### 4파트 구조
`346-AR-0012-BG`
- `346` — 제품 심볼 (슬롯 3,4,6 조합)
- `AR` — 공정 타입 (튜브/고압/진공/조립·R=원자재, A=조립)
- `0012` — 4자리 일련번호 (슬롯+공정별)
- `BG` — 옵션 코드 (색상·마감 등, 생략 가능)

---

## 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/codes/symbols` | GET | 100개 슬롯 전체 (`is_finished_good` / `is_reserved` 포함) |
| `/api/codes/symbols/{slot}` | PUT | 슬롯에 기호·모델명 배정 |
| `/api/codes/options` | GET | 옵션 코드 전체 |
| `/api/codes/process-types` | GET | 공정 타입 전체 (stage_order 정렬) |
| `/api/codes/process-flows` | GET | 공정 전이 규칙 |
| `/api/codes/parse` | POST | 임의 문자열 → 구조체 파싱 + 유효성 |
| `/api/codes/generate` | POST | 새 코드 생성 (일련번호 자동) |

### 예: 파싱
```json
POST /api/codes/parse
{ "code": "346-AR-0012-BG" }
```
응답:
```json
{
  "symbol": "346",
  "process_type": "AR",
  "serial": 12,
  "option": "BG",
  "symbol_slots": [3, 4, 6],
  "formatted_full": "346-AR-0012-BG",
  "formatted_compact": "346AR0012BG"
}
```

### 예: 생성
```json
POST /api/codes/generate
{ "symbol": "346", "process_type": "AR", "option": "BG" }
```
→ 같은 `(346, AR)`의 다음 일련번호 할당.

---

## FAQ

**Q. 슬롯이 100개인 이유?**
제품 기호 조합의 경우의 수 제한. 단일 슬롯(1~100)은 제품 기호 하나. 복수 슬롯 조합으로 "공용 부품"을 표현 (예: 슬롯 3+4+6 공용 → `346`).

**Q. 슬롯 PUT 시 `is_reserved`는?**
`symbol`과 `model_name` 둘 다 세팅되면 자동으로 `is_reserved=false`. 운영 시작 전 예약 해제.

**Q. 기호 중복 등록?**
409. 한 기호는 한 슬롯에만.

**Q. ProcessFlowRule은 어디서 쓰나?**
주로 문서·참고용. 실제 재고 이동 로직엔 직접 관여 안 함. 공정 체인 이해용 테이블.

**Q. `parse` 실패 예?**
공정 타입이 등록 안된 코드(`XY`), 슬롯에 없는 심볼, 포맷 오류 등 → 400.

---

## 관련 문서

- [[backend/app/main.py.md]] — 슬롯·공정·옵션 초기 시드
- [[backend/app/utils/erp_code.py.md]] — 코드 생성 알고리즘
- [[backend/app/services/codes.py.md]] — `parse_erp_code`, `generate_code` 로직
- [[backend/app/models.py.md]] — `ProductSymbol` / `OptionCode` / `ProcessType` / `ProcessFlowRule`
- 용어 사전 — 4파트 구조 상세

Up: [[backend/app/routers/routers]]
