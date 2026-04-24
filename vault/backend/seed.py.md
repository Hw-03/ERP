---
type: code-note
project: ERP
layer: backend
source_path: backend/seed.py
status: active
tags:
  - erp
  - backend
  - seed
  - data
aliases:
  - 시드 스크립트
  - 초기 데이터
---

# seed.py

> [!summary] 역할
> 레거시 HTML 샘플 데이터를 DB에 심는 스크립트. 개발·데모 환경 세팅용이다.

> [!info] 주요 책임
> - 레거시 엑셀/HTML 기반 품목 데이터를 DB에 insert
> - 테스트용 초기 재고 수량 설정

> [!warning] 주의
> - **샘플/데모 데이터 전용**. 운영 데이터와 혼동 금지.
> - 실제 운영 DB에 실행 시 기존 데이터에 충돌 가능.
> - `seed_bom.py`, `seed_employees.py`, `seed_packages.py`도 같은 성격의 파일들.

---

## 쉬운 말로 설명

**초기 구축 시 "최소한의 샘플 품목"을 DB 에 넣는 1회성 스크립트**. 과거 엑셀/HTML 기반 데모에서 가져온 데이터라 실제 자재와는 차이 있음. 실제 운영 마스터는 `scripts/erp_integration.py` + `scripts/import_real_inventory.py` 로 교체.

## 실행 순서 (개발 환경 초기 세팅)

```
1. seed.py           → 기본 품목 + 재고
2. seed_employees.py → 직원 26명
3. seed_bom.py       → 가상 BOM 트리
4. seed_packages.py  → 출하 묶음 20개
```

이 순서로 한 번 돌리면 모든 UI 가 "빈 화면 없이" 동작하는 완전한 테스트 환경 준비 완료.

## FAQ

**Q. 실행 여러 번?**
대부분 idempotent (같은 기본키면 스킵). 다만 랜덤 요소 있는 스크립트는 주의.

**Q. 이미 운영 DB 위에 실행하면?**
중복 키 오류 + 일부 테스트 데이터 혼입 위험. 운영 DB 에는 절대 실행 X.

---

## 관련 파일

- [[backend/seed_bom.py.md]] — BOM 샘플 데이터 시드
- [[backend/seed_employees.py.md]] — 직원 샘플 데이터 시드
- [[backend/seed_packages.py.md]] — 출하 패키지 샘플 시드
- [[scripts/import_real_inventory.py.md]] — 실제 재고 주입 (샘플 교체용)

Up: [[backend/backend]]
