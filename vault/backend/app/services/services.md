---
type: index
project: ERP
layer: backend
source_path: backend/app/services/
status: active
tags:
  - erp
  - backend
  - service
aliases:
  - 서비스 레이어
---

# backend/app/services

> [!summary] 역할
> 복잡한 비즈니스 로직을 라우터에서 분리해 별도 서비스 함수로 정리한 폴더.
> 라우터는 HTTP 처리만 하고, 실제 계산·조회 로직은 여기서 담당한다.

## 하위 문서

- [[backend/app/services/bom.py.md]] — BOM 트리 조회 로직
- [[backend/app/services/codes.py.md]] — ERP 코드 생성 서비스
- [[backend/app/services/inventory.py.md]] — 재고 계산·요약 로직
- [[backend/app/services/queue.py.md]] — 큐 배치 처리 로직

---

## 쉬운 말로 설명

"서비스"는 실제 일을 하는 계층. 라우터가 "이 요청 처리해주세요" 하면, 서비스가 **실제로 재고를 계산하고 DB를 바꾸는** 역할을 한다.

왜 분리했나? → 같은 로직을 여러 라우터가 써야 하거나, 테스트하기 쉽게 만들기 위해.

예: "재고 차감" 로직은 출고/이관/폐기 등 여러 라우터에서 쓰임 → 서비스로 빼서 재사용.

---

## 서비스별 담당 영역

| 서비스 | 담당 | 핵심 함수 |
|--------|------|---------|
| [[backend/app/services/inventory.py.md]] ⭐ | 재고 수량 계산·변경 | `receive_confirmed`, `transfer_to_production`, `_sync_total` |
| [[backend/app/services/bom.py.md]] | BOM 전개 (재귀) | `explode_bom`, `direct_children`, `merge_requirements` |
| [[backend/app/services/queue.py.md]] ⭐ | 배치 생성/확정/취소 | `create_batch`, `confirm_batch`, `cancel_batch` |
| [[backend/app/services/codes.py.md]] | ERP 코드 생성/파싱 | `generate_code`, `parse_erp_code`, `validate_code` |

---

## 서비스가 지켜야 할 불변식

### 재고 서비스
- 모든 위치 수량 합 = `total_quantity` (항상 일치)
- `warehouse_qty` 음수 불가
- `pending_quantity` 는 OPEN 배치 OUT 라인의 합

### BOM 서비스
- 순환 참조 방지 (depth ≤ 10)
- 존재하지 않는 품목 참조 시 에러

### 큐 서비스
- 배치 확정은 트랜잭션으로 묶임 (전부 or 전무)
- CONFIRMED/CANCELLED 배치는 재수정 불가

---

## FAQ

**Q. 왜 라우터에서 바로 DB 건드리면 안 되나?**
- 로직 재사용 어렵고, 테스트하기도 어렵다.
- 복잡한 규칙(불변식 유지)을 여러 곳에 중복 작성하면 버그 유발.
- 그래서 "얇은 라우터 + 두꺼운 서비스" 패턴 사용.

**Q. 서비스 함수가 DB를 여러 번 건드리다 실패하면?**
트랜잭션으로 묶인 범위 안에 있으면 롤백. 특히 `confirm_batch` 는 명시적으로 트랜잭션 관리.

**Q. 새 서비스 만들려면?**
`services/` 에 파일 생성 → 함수 정의 → 관련 라우터에서 import. `_index.md` 에 등록하고 관련 시나리오 문서 링크.

---

## 관련 문서

- [[backend/app/app]] (상위)
- [[backend/app/routers/routers]] — 이 서비스를 호출하는 라우터
- [[backend/app/models.py.md]] — 서비스가 조작하는 테이블
- 생산 배치 시나리오 ⭐ — `confirm_batch` 내부 로직 예시
- 재고 입출고 시나리오 — inventory 서비스 호출 흐름
- 용어 사전 — 트랜잭션, 불변식 용어

Up: [[backend/app/app]]
