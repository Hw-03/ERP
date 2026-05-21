---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/bom.py
tags: [vault, code-note, backend, router, layer/backend, topic/router, topic/BOM]
aliases:
  - BOM 라우터
---

# 📦 bom.py — BOM CRUD + 트리 조회 + Where-Used 역추적

> [!summary] 역할
> 부품 구성표(BOM)의 생성·수정·삭제, 재귀 트리 조회, 역방향 사용처 추적을 담당하는 라우터.
> 순환 참조 방지와 N+1 제거를 위해 `BomCache`(딕셔너리 기반 메모리 캐시)를 활용한다.

## 1. 이 파일의 역할

BOM(Bill of Materials, 자재명세서)은 "완제품 A를 만들려면 부품 B 2개 + 부품 C 1개가 필요하다"는 정보입니다.
이 파일은 그 정보를 CRUD하고, 트리 형태로 시각화할 수 있도록 재귀 응답을 제공합니다.
`where-used` 엔드포인트로 특정 부품이 어떤 완제품에 쓰이는지 역추적도 가능합니다.

## 2. 실제 원본 위치

- **원본**: `erp/backend/app/routers/bom.py` ([[erp/backend/app/routers/bom.py]])
- vault 노트는 분석 지도일 뿐, 수정은 원본에서만.

## 3. import 로 가져오는 것

| 모듈 | 역할 |
|---|---|
| `app.models` | `BOM`, `Item`, `Inventory` |
| `app.schemas` | `BOMCreate`, `BOMUpdate`, `BOMResponse`, `BOMDetailResponse`, `BOMTreeNode` |
| `app.services.audit` | 변경 이력 기록 |
| `app.services.bom` | `BomCache`, `build_bom_cache` — 전체 BOM을 메모리 dict로 로드 |
| `app.services._tx` | `commit_and_refresh`, `commit_only` |

## 4. export / 외부에 제공하는 것

- **prefix**: `/api/bom`

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/bom` | 전체 BOM 관계 목록 (parent·child 이름 포함) |
| `POST` | `/api/bom` | BOM 행 신규 생성 (순환 참조 사전 차단) |
| `PATCH` | `/api/bom/{bom_id}` | BOM 수량·단위 수정 |
| `GET` | `/api/bom/{parent_item_id}` | 특정 품목의 직접 자식(1단계) 조회 |
| `GET` | `/api/bom/{parent_item_id}/tree` | 재귀 트리 조회 (최대 10단계) |
| `DELETE` | `/api/bom/{bom_id}` | BOM 행 삭제 |
| `GET` | `/api/bom/where-used/{item_id}` | 해당 품목을 자식으로 쓰는 부모 목록 역추적 |

## 5. 이 파일을 참조하는 곳

- `erp/backend/app/main.py` — `app.include_router(bom.router, prefix="/api/bom", tags=["BOM"])`
- `erp/backend/app/routers/production.py` — production receipt 시 `_explode_bom` 서비스 경유로 간접 사용
- `erp/backend/app/routers/dept_adjustment.py` — `build_production_template` / `build_disassembly_template` 경유
- 프론트엔드 BOM 관리 화면 및 생산 가능 여부 화면

## 6. 실제 업무 흐름에서 언제 쓰이는지

- [[시나리오_생산배치]]: 생산 전 `GET /bom/{item_id}/tree`로 필요 부품 확인
- [[시나리오_분해반품]]: `where-used` 로 분해 대상 부품이 어디 쓰이는지 확인
- [[시나리오_품목등록]]: 신규 완제품 등록 후 BOM 구성 `POST /api/bom`

## 7. 핵심 함수 / 상수 / 매핑

| 함수 | 설명 |
|---|---|
| `get_bom_tree(parent_item_id, db)` | `build_bom_cache` 1회 + items IN 1회로 재귀 트리 반환 |
| `_build_tree_cached(...)` | DB 쿼리 0건 순수 재귀. `items_map`, `invs_map`, `cache` 딕셔너리만 사용 |
| `_collect_descendants(...)` | 후손 id 전부 수집 (트리 조회용 사전 IN 범위 계산) |
| `_is_circular(db, parent_id, new_child_id)` | DFS로 순환 참조 탐지. BOM 생성 시 사전 호출 |
| `get_where_used(item_id, db)` | child_item_id 기준 역방향 BOM 조회 |

## 8. ⚠️ 위험 포인트

> [!warning] 수정 시 깨지기 쉬운 지점
> - `_is_circular` 는 BOM 생성 시 DFS를 수행. BOM 규모가 커지면 느려질 수 있음 (현재 IN 쿼리 반복).
> - `_build_tree_cached`의 `depth > 10` 안전망: 10단계를 넘으면 자식 없이 잘린다. 실제 10단계 초과 BOM이 있으면 데이터 누락.
> - `visited` set 복사(`visited | {item.item_id}`) 패턴: 원본 visited를 수정하지 않아야 형제 노드 방문이 가능. `visited.add(...)` 로 바꾸면 형제가 잘림.
> - `BOMTreeNode` 응답 크기: 복잡한 BOM에서 트리가 수백 노드가 될 수 있음. 페이징 없음.

[[위험지대_지도]] — 순환 참조, 재귀 깊이 한계

## 9. 죽은 코드 의심 / 삭제하면 안 되는 이유

- `get_bom_flat(parent_item_id)`: `/tree` 가 있어서 사용 빈도가 낮아 보이지만, 간단한 1단계 조회용으로 프론트에서 사용할 수 있어 유지 필요.
- `_collect_descendants`: `get_bom_tree`에서만 호출. 별도 함수로 분리된 이유는 IN 쿼리 범위를 미리 수집하기 위한 것. 삭제하면 N+1 발생.

## 10. 수정 전 체크리스트

- [ ] `verify_local.ps1` 통과 확인
- [ ] `tests/test_bom.py` 확인 (순환 참조 테스트 포함 여부)
- [ ] `production.py`의 `_explode_bom` 서비스 수정 영향 확인
- [ ] `depth` 한계(10) 변경 시 `_collect_descendants`도 동일하게 맞출 것
- [ ] BOM 삭제 시 연관 production receipt 이력 영향 없는지 확인

## 11. 핵심 코드 발췌

> [!example] 순환 참조 방지 + 캐시 기반 트리 재귀 (약 35줄)
> ```python
> def _is_circular(db: Session, parent_id: uuid.UUID, new_child_id: uuid.UUID) -> bool:
>     visited = set()
>     stack = [new_child_id]
>     while stack:
>         current = stack.pop()
>         if current == parent_id:
>             return True
>         if current in visited:
>             continue
>         visited.add(current)
>         children = db.query(BOM.child_item_id).filter(BOM.parent_item_id == current).all()
>         stack.extend(child_id for (child_id,) in children)
>     return False
>
> def _build_tree_cached(
>     item, required_quantity, items_map, invs_map, cache, depth, visited
> ) -> BOMTreeNode:
>     """메모리 dict 만 참조하는 순수 재귀 — DB 쿼리 0건."""
>     inv = invs_map.get(item.item_id)
>     current_stock = inv.quantity if inv else Decimal("0")
>
>     if item.item_id in visited or depth > 10:
>         return BOMTreeNode(
>             item_id=item.item_id, item_code=item.item_code,
>             item_name=item.item_name, process_type_code=item.process_type_code,
>             unit=item.unit, required_quantity=required_quantity,
>             current_stock=current_stock, children=[],
>         )
>
>     visited = visited | {item.item_id}  # 복사! 형제 노드 방문 보존
>     children = []
>     for child_id, child_per_unit in cache.get(item.item_id, []):
>         child_item = items_map.get(child_id)
>         if not child_item:
>             continue
>         children.append(
>             _build_tree_cached(
>                 child_item, child_per_unit * required_quantity,
>                 items_map, invs_map, cache, depth + 1, visited,
>             )
>         )
>     return BOMTreeNode(..., children=children)
> ```

`_is_circular`는 DFS 스택 반복, `_build_tree_cached`는 `visited | {id}` 복사 패턴으로
형제 노드가 올바르게 방문되도록 보장한다.

```mermaid
flowchart TD
    FE["프론트엔드\nBOM 트리 화면"] -->|GET /api/bom/{id}/tree| R["bom.py\nget_bom_tree"]
    R -->|"build_bom_cache(db)"| SVC["services/bom.py\nBomCache"]
    R -->|"_collect_descendants"| IDs["후손 ID set"]
    R -->|Item IN 1회| DB_Item[("Item")]
    R -->|Inventory IN 1회| DB_Inv[("Inventory")]
    R -->|"_build_tree_cached(0 DB쿼리)"| Tree["BOMTreeNode\n재귀 응답"]
```

## 관련 노트

- [[처음_읽는_사람]], [[ERP_MOC]], [[용어사전]]
- [[erp/backend/app/services/bom.py]]
- [[erp/backend/app/routers/production.py]]
- [[erp/backend/app/models.py]]

Up: [[_routers]]
