---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/ship_packages.py
status: active
tags:
  - erp
  - backend
  - router
  - ship-packages
aliases:
  - 출하 패키지 라우터
---

# ship_packages.py

> [!summary] 역할
> 출하 패키지(묶음 출하)를 관리하는 API. 여러 품목을 하나의 패키지로 묶어 한 번에 출하할 수 있다.

> [!info] 주요 책임
> - `GET /api/ship-packages` — 패키지 목록 조회
> - `POST /api/ship-packages` — 패키지 생성
> - `PUT /api/ship-packages/{package_id}` — 패키지 정보 수정
> - `DELETE /api/ship-packages/{package_id}` — 패키지 삭제
> - `POST /api/ship-packages/{package_id}/items` — 패키지에 품목 추가
> - `DELETE /api/ship-packages/{package_id}/items/{package_item_id}` — 품목 제거

> [!warning] 주의
> - 실제 출하(재고 차감)는 `inventory.py`의 `/api/inventory/ship-package`에서 처리

---

## 쉬운 말로 설명

**출하 패키지** = "이 묶음으로 한 번에 내보낼 품목 + 수량" 템플릿. 자주 쓰는 출하 조합을 미리 등록해두고, 실제 출하 시 패키지 선택 + 수량만 지정하면 구성품이 한꺼번에 출고.

이 라우터는 패키지 **등록·구성 관리** (재고는 안 건드림). 실제 출고는 `inventory.py`의 `ship-package`.

---

## 엔드포인트

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/ship-packages` | GET | 패키지 목록 + 구성품 |
| `/api/ship-packages` | POST | 패키지 생성 (package_code 유니크) |
| `/api/ship-packages/{id}` | PUT | 이름·메모 수정 |
| `/api/ship-packages/{id}` | DELETE | 패키지 삭제 (구성품 CASCADE) |
| `/api/ship-packages/{id}/items` | POST | 구성품 추가/수량 업데이트 |
| `/api/ship-packages/{id}/items/{package_item_id}` | DELETE | 구성품 제거 |

### 요청 예시

**생성**:
```json
POST /api/ship-packages
{
  "package_code": "SOLO-STD-01",
  "name": "SOLO 표준 패키지",
  "notes": "본체 + 케이블 + 매뉴얼"
}
```

**구성품 추가**:
```json
POST /api/ship-packages/{id}/items
{ "item_id": "uuid-SOLO-본체", "quantity": 1 }
```

같은 `item_id`로 재요청 시 → 수량 덮어씀(중복 생성 안 함).

---

## FAQ

**Q. `package_code`는 어디서 쓰이나?**
사람이 알아보기 쉬운 별명. API는 UUID 기반이지만 화면에서 `SOLO-STD-01` 같은 코드 표시.

**Q. 빈 패키지를 출하 시도하면?**
`inventory/ship-package`에서 400 `패키지에 등록된 품목이 없습니다.`

**Q. 구성품 수량 소수?**
`Numeric(15,4)`. 무게·길이 단위 가능.

**Q. 패키지 출하 실패 시?**
`inventory/ship-package`가 모든 구성품 사전 검사 → 하나라도 부족하면 422 + 부족 목록. 출하 전 반드시 부서 이동.

---

## 관련 문서

- [[backend/app/routers/inventory.py.md]] — 실제 출고 처리 `ship-package`
- [[backend/app/models.py.md]] — `ShipPackage`, `ShipPackageItem`
- [[frontend/app/admin/admin]] — 패키지 관리 UI

Up: [[backend/app/routers/routers]]
