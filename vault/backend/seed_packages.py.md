---
type: code-note
project: ERP
layer: backend
source_path: backend/seed_packages.py
status: active
tags:
  - erp
  - backend
  - seed
  - ship-packages
aliases:
  - 출하묶음 시드 스크립트
---

# seed_packages.py

> [!summary] 역할
> 출하묶음(ShipPackage) 20개와 각 묶음에 포함된 품목을 DB에 생성하는 스크립트.
> 개발/테스트 환경에서 출하 패키지 기능을 확인할 수 있도록 샘플 데이터를 만든다.

> [!info] 생성 내용
> - 패키지 코드: `PKG-001` ~ `PKG-020`
> - 모델명: DX3000, ADX4000W, ADX6000FB, COCOON, SOLO 중 랜덤
> - 패키지 유형: 기본/표준/완전 세트, 수출용, 국내, OEM, A/S 세트 등
> - 각 패키지당 품목 10개씩 포함 (랜덤 선택)
> - 이미 존재하는 코드는 건너뜀

## 실행 방법

```bash
cd backend
python seed_packages.py
```

---

## 쉬운 말로 설명

**테스트용 출하 패키지("묶음") 20개를 DB 에 깔아주는 스크립트**. 출하 패키지 = 완성품 출고 시 함께 배송되는 품목 세트 (본체 + 리모컨 + 매뉴얼 등).

## 예시 생성 데이터

```
PKG-001  DX3000 기본 세트     품목 10개
PKG-002  DX3000 표준 세트     품목 10개
PKG-003  ADX4000W 완전 세트   품목 10개
PKG-004  ADX6000FB 수출용     품목 10개
PKG-005  COCOON OEM 버전      품목 10개
...
PKG-020  SOLO A/S 세트        품목 10개
```

패키지 코드 이미 있으면 스킵 → 여러 번 돌려도 안전.

## FAQ

**Q. 실제 출하 패키지는?**
관리자 탭 → 출하묶음 섹션에서 수동 등록. 이 시드는 테스트용.

**Q. 패키지 출고 확인은?**
`DesktopWarehouseView` 의 `package-out` 탭에서 "PKG-001 선택 → 출고" 실행.

---

## 관련 문서

- [[backend/app/routers/ship_packages.py.md]] — 출하묶음 API
- [[backend/seed.py.md]] — 기본 시드 스크립트
- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]] — `package-out` 탭

Up: [[backend/backend]]
