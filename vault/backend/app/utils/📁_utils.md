---
type: index
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/utils/
tags: [vault, index, folder-marker]
aliases:
  - "utils"
  - "utils.md"
---

# 📁 utils

> [!summary] 역할
> 도메인 로직에 속하지 않는 횡단 관심사 유틸리티 모음. Excel 처리, 아이템 코드 변환, legacy 호환 래퍼를 제공한다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/backend/app/utils/` 의 vault 미러. 자식 파일들의 분석 노트가 모여 있다.

## 어떤 파일들이 있나

- `[[erp/backend/app/utils/excel.py|excel.py]]` — xlsx 파일 읽기·쓰기 래퍼. `openpyxl` 기반. 재고 템플릿 임포트와 `export_helpers` 에서 호출됨.
- `[[erp/backend/app/utils/item_code.py|item_code.py]]` — `ItemCode` 도메인 타입. 코드 파싱·포맷·검증 순수 함수. f1ff96c 커밋에서 `ErpCode` 에서 rename.
- `[[erp/backend/app/utils/erp_code.py|erp_code.py]]` — legacy 호환 래퍼. `erp_code` 식별자를 사용하는 기존 코드가 깨지지 않도록 `item_code` 를 재익스포트함. 직접 수정 금지.
- `__init__.py` — 패키지 마커.

## 도메인 컨텍스트

`excel.py` 는 운영 팀이 제공하는 엑셀 시트를 시스템에 임포트할 때 사용된다. `item_code.py` 는 아이템 코드 체계(공정 유형 코드 포함)의 단일 진실 출처다.

## ⚠️ 위험 포인트

- `erp_code.py` 는 legacy 식별자 유지를 위한 파일임 — rename 또는 삭제 금지 (CLAUDE.md 규칙).
- `item_code.py` 의 파싱 로직 변경 시 코드 체계에 의존하는 `items.py` 라우터, `stock_math.py` 서비스 동반 검토 필요.
- `excel.py` 의 시트 컬럼 매핑은 운영 팀 템플릿과 1:1 대응임 — 컬럼 추가·제거 전 템플릿 확인.

## 관련 가이드

- [[erp/_vault/guides/item-code|item-code]]
- [[erp/_vault/guides/excel-import|excel-import]]
