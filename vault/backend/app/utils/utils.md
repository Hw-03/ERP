---
type: index
project: ERP
layer: backend
source_path: backend/app/utils/
status: active
tags:
  - erp
  - backend
  - utils
aliases:
  - 유틸리티 폴더
---

# backend/app/utils

> [!summary] 역할
> 재사용 가능한 유틸리티 함수 모음. ERP 코드 생성과 엑셀 처리를 담당한다.

## 하위 문서

- [[backend/app/utils/erp_code.py.md]] — ERP 4-part 코드 자동 생성
- [[backend/app/utils/excel.py.md]] — 엑셀 파일 읽기/쓰기

---

## 쉬운 말로 설명

"utils"는 여기저기서 재사용하는 도구 모음. 특정 기능에 묶이지 않고, 여러 라우터/서비스에서 공통으로 필요한 작업을 모아놓은 곳.

현재 이 ERP의 utils에는 **2개 파일**만 있다:
1. `erp_code.py` — ERP 코드 4파트 만들기/쪼개기
2. `excel.py` — 엑셀 파일 읽고 쓰기

---

## 각 유틸리티의 역할

### erp_code.py ⭐
품목마다 고유 식별자(`346-AR-0001` 같은) 를 만들 때 쓰인다.

핵심 함수:
- `format_erp_code(symbol, process, serial, option)` — 조립
- `parse_erp_code(code_string)` — 분해
- 호출 위치: `services/codes.py` 에서 주로 사용

### excel.py
엑셀(.xlsx) 파일 읽기/쓰기.
- 시드 스크립트가 `data/` 의 엑셀을 읽을 때
- 품목 목록을 엑셀로 내보낼 때 (`GET /api/items/export`)

---

## FAQ

**Q. 왜 `utils/` 안에 파일이 2개뿐인가?**
대부분의 재사용 로직은 `services/` 로 갔다. `utils/` 는 "특정 도메인에 안 묶이는" 순수 도구만 남았다.

**Q. 새로운 공통 함수는 어디에 넣어야 하나?**
- 특정 도메인(재고/BOM/코드)에 관련 → `services/`
- 범용 (문자열 처리, 날짜 계산, 외부 파일 처리) → `utils/`

---

## 관련 문서

- [[backend/app/app]] (상위)
- [[backend/app/utils/erp_code.py.md]] ⭐ — 코드 규칙 상세
- [[backend/app/utils/excel.py.md]] — 엑셀 처리
- [[backend/app/services/codes.py.md]] — erp_code 를 사용하는 서비스
- 용어 사전 — ERP 코드 구조

Up: [[backend/app/app]]
