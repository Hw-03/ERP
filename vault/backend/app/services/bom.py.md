---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/bom.py
status: active
tags:
  - erp
  - backend
  - service
  - bom
aliases:
  - BOM 서비스
---

# services/bom.py

> [!summary] 역할
> BOM 트리를 재귀적으로 조회하는 비즈니스 로직. 다단계 부품 구조를 트리 형태로 반환한다.

> [!info] 주요 책임
> - 재귀 BOM 트리 조회 (부모→자식→손자 구조)
> - 각 노드에 현재 재고 수량 포함
> - 생산 가능 여부 계산에 사용

---

## 쉬운 말로 설명

**BOM 폭파(Explode)** = "제품 1개 만들려면 최하위 부품이 몇 개 필요한가"를 계산해내는 로직.

예: ADX6000FB 1대 만드는데 → BOM에 "본체 1 + 케이블 2"가 있고, "본체" 또한 BOM이 있어 "보드 1 + 케이스 1"로 이루어져 있다면 → 최종 리프 부품으로 `보드 1, 케이스 1, 케이블 2`를 반환.

즉 중간 조립체는 투명하게 내려가고 **실제 창고에서 꺼내야 할 가장 말단 부품만** 남긴다. 이걸 쓰면 생산 배치 생성 시 "자재 얼마나 필요한가"를 자동으로 계산할 수 있다.

---

## 핵심 함수

### `explode_bom(db, parent_item_id, qty_to_produce, depth=0, visited=frozenset())`
- 재귀적으로 BOM을 리프까지 전개.
- `(child_item_id, required_qty)` 튜플 리스트 반환.
- **depth 제한**: `MAX_DEPTH = 10`. 10단 넘으면 빈 리스트 반환(무한 재귀 차단).
- **순환 방지**: `visited` 프로즌셋에 부모 id 누적. 이미 방문한 id가 부모로 돌아오면 중단.
- 자식이 또 BOM을 가지면 재귀, 없으면 리프로 결과에 추가.

### `merge_requirements(pairs)`
- `[(id, qty), (id, qty), ...]` 리스트를 `{id: total_qty}` dict로 합산.
- 같은 부품이 여러 번 나오면 수량을 더함.

### `direct_children(db, parent_item_id)`
- 한 단계만 내려가서 **직접 자식만** 반환.
- 용도: 분해(DISASSEMBLE) / 반품(RETURN) 시 "바로 아래 부품"을 보여줘야 할 때 (리프까지 내려가면 안 됨).

---

## 의사코드 (explode_bom)

```
explode_bom(parent_id, qty, depth, visited):
  if depth > 10 or parent_id in visited:
    return []
  visited = visited + {parent_id}
  result = []
  for each BOM row where parent = parent_id:
    required = row.quantity * qty
    if 자식에게도 BOM 있음:
      result += explode_bom(자식, required, depth+1, visited)
    else:
      result += [(자식, required)]
  return result
```

---

## 누가 호출하나

- `services/queue.py::_seed_lines_from_bom()` — 배치 생성 시 OUT 라인 자동 채움.
- `routers/production.py::receipt_confirmed()` — 백플러시(BACKFLUSH)로 자재 차감.
- `routers/bom.py::GET /tree` — 간접 사용(별도 재귀).

---

## FAQ

**Q. 왜 리프만 반환?**
중간 조립체는 실물이 창고에 없고 논리 단위일 뿐. 실제 차감 대상은 가장 말단 부품.

**Q. 중간 조립체가 진짜 재고로 존재하는 경우?**
그 중간 조립체의 BOM을 비워두면 리프로 취급돼 그 자체가 차감 대상이 된다.

**Q. 순환 참조가 있으면?**
`A→B→A` 같은 순환은 `visited`가 막는다. 빈 결과 반환 → 경고는 별도 없음, 사용자가 BOM 편집 시 주의.

**Q. depth 10 초과 시 동작?**
조용히 빈 리스트 반환. 10단 구조 설계는 비현실적이므로 실사용에선 안 걸림.

---

## 관련 문서

- [[backend/app/routers/bom.py.md]]
- [[backend/app/routers/production.py.md]]
- [[backend/app/services/queue.py.md]] — `_seed_lines_from_bom`
- [[backend/app/models.py.md]] — `BOM` 테이블
- 생산 배치 시나리오

Up: [[backend/app/services/services]]
