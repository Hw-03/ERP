---
type: code-note
project: ERP
layer: scripts
source_path: scripts/randomize_inventory.py
status: active
tags:
  - erp
  - scripts
  - test
  - inventory
aliases:
  - 랜덤 재고 분배 스크립트
---

# randomize_inventory.py

> [!summary] 역할
> 테스트 목적으로 **창고/부서 재고를 랜덤하게 분배**하고 안전재고를 설정하는 스크립트.
> 개발 환경에서 다양한 재고 상황을 시뮬레이션하기 위해 사용한다.

> [!info] 동작 규칙
> - 각 품목의 총 수량을 창고 + 1~3개 부서로 랜덤 분배
> - 카테고리별 주요 부서 가중치 반영 (TA→튜브, HA→고압, VA→진공, BA→조립, FG→출하)
> - 10% 확률로 불량 재고 추가 (총량의 2~8%)
> - 70% 품목에 안전재고 설정, 그 중 30%는 현재 재고 이하로 설정 (경보 테스트용)

> [!info] 실행 모드
> | 명령 | 동작 |
> |------|------|
> | `python scripts/randomize_inventory.py` | dry-run (미리보기만) |
> | `python scripts/randomize_inventory.py --apply` | 실제 DB 반영 |

---

## 쉬운 말로 설명

**테스트 DB 를 실감나게 만들어주는 "더미 재고 뿌리기" 스크립트**. 재고가 모두 창고에만 쌓여있으면 테스트 시 부서별 재고 UI 가 텅 비어 보이는데, 이 스크립트로 "부서별로 얼마씩 흩뿌린" 상태를 자동 생성.

개발자 전용. 운영 DB 에 절대 사용 금지.

## 분배 규칙 예시

품목 `3-AR-0001` 메인보드 (총 100개) 의 경우:
- 창고: 50개
- 조립 부서: 35개 (카테고리 BA 가중치)
- 튜브 부서: 10개
- 출하 부서: 5개

10% 확률로 불량 재고 추가. 안전재고(`min_stock`)도 품목 70% 에 설정. 그 중 30% 는 현재 재고 미만 → 안전재고 미달 알림 테스트 시나리오 자동 생성.

## FAQ

**Q. 실제 재고 데이터 위에 덮어쓰지?**
YES. 실제 데이터는 backup 후 사용.

**Q. seed 값 고정?**
코드 내 `random.seed()` 설정 없으면 매번 다름. 테스트 재현성 원하면 시드 고정 필요.

**Q. 일부 품목만?**
현재 옵션 없음. 전체 품목 대상. 필요하면 카테고리 필터 인자 추가.

---

## 관련 문서

- [[backend/app/routers/inventory.py.md]] — 재고 API
- [[backend/app/routers/alerts.py.md]] — 안전재고 알림
- [[scripts/import_real_inventory.py.md]] — 실제 데이터 주입

Up: [[scripts/scripts]]
