---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/bom.py
status: active
tags:
  - erp
  - backend
  - router
  - bom
aliases:
  - BOM 라우터
  - 자재명세서 API
---

# bom.py

> [!summary] 역할
> BOM(Bill of Materials, 자재명세서)을 관리하는 API. 어떤 제품을 만들 때 어떤 부품이 몇 개 필요한지를 정의한다.

> [!info] 주요 책임
> - `GET /api/bom/{parent_item_id}` — 특정 품목의 BOM 목록 조회
> - `GET /api/bom/{parent_item_id}/tree` — BOM 트리 구조 조회 (다단계 재귀)
> - `POST /api/bom` — BOM 항목 추가
> - `PATCH /api/bom/{bom_id}` — BOM 수량/단위 수정
> - `DELETE /api/bom/{bom_id}` — BOM 항목 삭제

> [!warning] 주의
> - BOM 트리는 재귀적으로 조회됨 — 순환 참조 주의
> - BOM 정보는 생산 입고 시 Backflush(자재 자동 차감)에 사용됨

---

## 쉬운 말로 설명

BOM = **"제품 하나 만들 때 필요한 부품 목록표"**. 예: ADX6000 1대 = 튜브 1 + 고압보드 1 + 케이블 2.

이 라우터는 그 목록표를 **만들고/읽고/고치고/지우는** CRUD 엔드포인트. 실제 자재 차감(BOM 폭발 → 재고 감소)은 `queue.py` + `services/queue.py`에서 처리한다.

---

## 엔드포인트 상세

| 경로 | 메서드 | 용도 |
|------|--------|------|
| `/api/bom` | POST | 부모-자식 관계 추가 |
| `/api/bom/{parent_item_id}` | GET | 직자식 목록 (평면 1단계) |
| `/api/bom/{parent_item_id}/tree` | GET | 재귀 트리 (깊이 10 제한) |
| `/api/bom/{bom_id}` | PATCH | 수량·단위 수정 |
| `/api/bom/{bom_id}` | DELETE | 관계 삭제 |

### 요청 예시

**생성**:
```json
POST /api/bom
{
  "parent_item_id": "uuid-of-ADX6000",
  "child_item_id": "uuid-of-튜브",
  "quantity": 1,
  "unit": "EA",
  "notes": "표준 사양"
}
```

**트리 조회 응답** (`BOMTreeNode` 재귀):
```json
{
  "item_id": "uuid-ADX6000",
  "erp_code": "346-PA-0001",
  "item_name": "ADX6000",
  "category": "FG",
  "required_quantity": 1,
  "current_stock": 3,
  "children": [
    {
      "item_id": "uuid-튜브",
      "erp_code": "3-AR-0012",
      "required_quantity": 1,
      "current_stock": 5,
      "children": [ ... 재귀 ... ]
    }
  ]
}
```
`required_quantity`는 상위 노드에서 누적 곱. 예: 부모 2개 생산이면 자식 `required = BOM.quantity × 2`.

---

## 안전장치

- **자기참조 금지**: `parent_item_id == child_item_id` → 400
- **중복 금지**: `(parent, child)` 유니크 → 409
- **순환 참조 검사** (`_is_circular`): A→B→C→A 같은 경우 409. DFS 스택 사용.
- **깊이 제한** (`depth > 10`): 트리 조회 시 더 이상 펼치지 않음. 잘못된 BOM 구성 보호.

---

## FAQ

**Q. 부모가 자식을 여러 개 가질 수 있나?**
당연. `(parent=ADX6000, child=튜브, qty=1)`, `(parent=ADX6000, child=보드, qty=1)` 각각 다른 행.

**Q. 자식을 중간에 바꾸려면?**
DELETE 후 POST. 또는 DELETE → 새 POST. PATCH로 자식 교체는 불가(수량·단위만).

**Q. `quantity=0.5` 가능?**
`Numeric(15,4)`라 소수점 4자리까지 OK. 도료 0.25kg 등 가능.

**Q. BOM 트리 10 깊이 제한 넘으면?**
해당 자식 노드의 `children=[]`으로 반환. 화면에서 "더 보기" 없음. 실무에서 10단계는 매우 깊다 — 대부분 3~5단계.

**Q. BOM 수정하면 이미 만든 제품 재고는?**
변동 없음. BOM은 "앞으로 만들 때"만 참조. 과거 배치는 당시 BOM 기준으로 이미 처리됨.

**Q. 자식만 삭제하면 부모도 영향?**
items CASCADE로 자식 `items` 행을 지우면 `bom` 행도 삭제. 부모 행 자체는 남음. 하지만 대부분 `items` 직접 삭제는 지양.

---

## 관련 문서

- [[backend/app/services/bom.py.md]] — `explode_bom()` (재귀 폭발)
- [[backend/app/services/queue.py.md]] — 배치 생성 시 BOM 자동 로드
- [[backend/app/models.py.md]] — `BOM` 테이블
- [[backend/app/routers/production.py.md]] — Backflush 경로
- [[backend/app/routers/queue.py.md]] — `load_bom=true` 배치 생성
- [[frontend/app/bom/bom]]
- 용어 사전 — BOM / 백플러시 설명

Up: [[backend/app/routers/routers]]
