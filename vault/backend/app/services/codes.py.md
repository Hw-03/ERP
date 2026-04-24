---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/codes.py
status: active
tags:
  - erp
  - backend
  - service
  - codes
aliases:
  - 코드 서비스
---

# services/codes.py

> [!summary] 역할
> ERP 코드 체계(ProductSymbol, OptionCode, ProcessType) 조회 서비스.

> [!info] 주요 책임
> - 심볼·옵션·공정 타입 데이터 조회
> - `codes.py` 라우터에서 호출

---

## 쉬운 말로 설명

이 파일이 **ERP 코드 체계의 엔진**. 코드의 생성·파싱·검증·일련번호 부여를 모두 담당.

코드 형식: `{제품기호}-{구분코드}-{일련번호}-{옵션코드}` (옵션 생략 가능)

- `3-PA-0012-WM` = 제품기호 3(DX3000 슬롯), 공정 PA(최종 완제품), 일련번호 12, 옵션 WM(흰색 무광)
- `376-TR-0012-BG` = 제품기호 376(여러 제품에 공유되는 자재), 공정 TR, 일련번호 12, 옵션 BG

**핵심 규칙**:
- 제품기호는 숫자만 (슬롯 ID들을 이어붙임)
- 단일 슬롯 기호(`3`)는 특정 제품 전용, 다자리 기호(`376`)는 여러 제품 공유 자재/조립체
- `PA`(완제품), `AA`(최종 조립체)는 **반드시 단일 슬롯 기호**만 허용 → 공유 기호로 완제품 만들 수 없음
- 일련번호는 `{symbol}-{process_type}` 조합별로 개별 관리 (겹치지 않음)

---

## 핵심 함수

### `parse_erp_code(raw: str) -> ErpCode`
- `"3-PA-12-BG"` 또는 `"3-PA-0012-BG"` 모두 허용 (compact/zero-pad 둘 다).
- 토큰 개수 3 또는 4만 허용 (옵션 없어도 됨).
- 제품기호는 숫자 전용, 공정/옵션은 2자 고정.
- 잘못된 형식 → `ValueError`.

### `format_erp_code(code: ErpCode, *, compact=False) -> str`
- `ErpCode` 객체 → 문자열. `compact=True`면 `0012` → `12`.

### `validate_code(db, code)`
- 마스터 테이블과 대조 검증:
  - 제품기호 각 자리가 `product_symbols` 테이블에 존재 & 예약석 아님
  - `process_type` 이 `process_types` 테이블에 존재
  - `PA`/`AA`면 단일 슬롯 + `is_finished_good=True`
  - 옵션 있으면 `option_codes` 에 존재

### `next_serial(db, symbol, process_type) -> int`
- 해당 `(symbol, process_type)` 조합의 Item 테이블 최대 `serial_no` + 1.
- 조합별 독립 → `3-PA` 시리얼과 `3-AA` 시리얼 따로 증가.

### `generate_code(db, *, symbol, process_type, option=None) -> ErpCode`
- 자동 일련번호 부여 + 검증 → 바로 쓸 수 있는 `ErpCode` 반환.

---

## ErpCode 데이터 클래스

```python
@dataclass
class ErpCode:
    symbol: str              # "3" or "376"
    process_type: str        # "TR", "PA" ...
    serial: int              # 12 (정수)
    option: Optional[str]    # "BG" or None
    symbol_slots: List[int]  # [3, 7, 6] 파싱된 슬롯 목록
```

---

## FAQ

**Q. 왜 symbol만 숫자? 글자 쓰면 안 되나?**
제품기호 슬롯이 0~9 범위로 고정됐다. 다자리 기호(`376`)는 자릿수 기호를 이어붙인 형태라 숫자만 허용.

**Q. 같은 제품기호인데 일련번호 중복 허용되나?**
아니. `(symbol, process_type)` 쌍 기준으로 유니크. `3-PA-0012` 두 개면 중복 에러.

**Q. `PA`/`AA`에 `376` 같은 공유 기호 쓰면?**
검증에서 `ValueError`. 완제품은 반드시 특정 슬롯(단일 기호)에 귀속돼야 함.

**Q. 옵션 없는 품목은?**
`option=None` 허용. 코드 문자열에선 3토큰 형태 `3-TR-0012`.

**Q. Reserved 슬롯이란?**
아직 제품 배정이 안 된 예약 슬롯(ProductSymbol.is_reserved=True). 이 슬롯으로 코드 생성 시도 → 거부.

---

## 관련 문서

- [[backend/app/routers/codes.py.md]] — HTTP 엔드포인트
- [[backend/app/utils/erp_code.py.md]] — 고수준 코드 빌더
- [[backend/app/models.py.md]] — `ProductSymbol`, `OptionCode`, `ProcessType`
- 용어 사전 — ERP 코드 4파트

Up: [[backend/app/services/services]]
