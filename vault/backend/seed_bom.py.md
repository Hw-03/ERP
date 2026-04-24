---
type: code-note
project: ERP
layer: backend
source_path: backend/seed_bom.py
status: active
tags:
  - erp
  - backend
  - seed
  - bom
aliases:
  - BOM 시드 스크립트
---

# seed_bom.py

> [!summary] 역할
> DB에 계층적 BOM(자재 명세서) 샘플 데이터를 자동으로 생성하는 스크립트.
> 개발/테스트 환경에서 BOM 트리 구조를 미리 만들어 두기 위해 사용한다.

> [!info] 생성 구조
> - **Level 1**: BA 품목 상위 10개를 부모로, TA/HA/VA/RM 혼합 자식 10개씩 연결
> - **Level 2**: Level 1 자식 중 TA/HA/VA 6개를 부모로, RM 자식 5개씩 연결
> - 수량은 1~8 사이 랜덤, 단위는 `EA`
> - 중복 BOM 항목은 자동 스킵

> [!warning] 주의
> 이 스크립트는 **테스트용 가상 BOM**을 생성한다.
> 실제 제품 BOM 데이터와는 다르며, `random.seed(42)` 로 고정되어 있어 실행마다 동일한 결과가 나온다.

## 실행 방법

```bash
cd backend
python seed_bom.py
```

---

## 쉬운 말로 설명

**테스트용 BOM(제품 하나를 만들 때 필요한 자재 목록) 트리를 자동으로 깔아주는 스크립트**. 실제 BOM 과 무관. UI 에서 "BOM 이 어떻게 보이는지" 테스트할 때 사용.

`random.seed(42)` 고정 → 실행해도 항상 같은 구조 생성.

## 생성 예시

```
BA 품목 0 (완성품 A)
 ├── TA 자재 1 (수량 3)
 ├── HA 자재 4 (수량 5)
 ├── RM 자재 7 (수량 2)
 └── ...(총 10개 자식)

TA 자재 1 (조립 하위)
 ├── RM 자재 12 (수량 1)
 ├── RM 자재 15 (수량 8)
 └── ...(총 5개 자식)
```

## FAQ

**Q. 실제 운영 BOM 에 덮어쓰지?**
신규 BOM 만 추가. 기존 `(parent, child)` 쌍 있으면 스킵.

**Q. MAX_DEPTH 10 에 걸리지?**
이 스크립트는 Level 2 까지만 생성하므로 여유 충분.

---

## 관련 문서

- [[backend/seed.py.md]] — 기본 품목(Item) 시드
- [[backend/app/routers/bom.py.md]] — BOM API 라우터
- [[backend/app/services/bom.py.md]] — BOM 비즈니스 로직

Up: [[backend/backend]]
