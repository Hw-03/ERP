# BOM 그래프 개선 검토 계획서

> 권동환 사원님 리뷰 검토용 초안
> 기준: GitHub `origin/main` / local `main` 동일 커밋 `31231a86e25167a0913b0ca88809edde16bf6c70`
> 작성일: 2026-07-07
> 대상: `backend/scripts/build_bom_graph_html.py`, `backend/scripts/inspect_bom_depth.py`

## 1. 결론 요약

권동환 사원님 리뷰는 코드 기준으로 대부분 타당합니다.

- `build_bom_graph_html.py`는 실제로 전체 `items`를 한 번에 메모리에 올리고 있습니다. 현재 `items_map = {i.item_id: i for i in db.query(Item).all()}` 구조라 품목 수가 커질수록 스크립트 실행 순간 메모리 피크가 커집니다.
- BOM 수량도 실제로 누락되어 있습니다. `for child_id, _qty in cache.get(item_id, [])`에서 `_qty`를 받아오지만 트리 노드 데이터와 HTML 표시에는 반영하지 않습니다.
- `inspect_bom_depth.py`는 BFS 루프 안에서 품목과 BOM 자식을 건별 조회합니다. 데이터가 커지면 N+1 쿼리 패턴이 그대로 드러납니다.
- 정전개/역전개 인터랙션은 현재 제조 현업 관점에서 명확하지 않습니다. 클릭한 노드의 하위와 상위를 상황별로 섞어 강조하므로, "이 자재가 어디에 쓰이는지"와 "이 제품을 만들려면 무엇이 필요한지"가 한 화면 규칙 안에서 분리되지 않습니다.
- 하드코딩 문제는 맞지만, 새 마스터 테이블을 먼저 만들 필요는 없어 보입니다. 이미 `ProductSymbol`, `ProcessType`, `items.min_stock`가 있으므로 기존 마스터를 읽어 동적으로 구성하는 것이 1차 대응으로 적절합니다.

우선순위는 다음 순서가 안전합니다.

1. 스크립트 메모리 폭탄과 N+1 쿼리 제거
2. BOM 소요량과 가용재고 분석값을 데이터에 포함
3. 정전개/역전개 모드 분리
4. 500개 이상 노드 대응 렌더링 최적화
5. 모델/공정/범례 하드코딩 제거

## 2. 코드 기준 항목별 판단

### 2.1 `build_bom_graph_html.py` 성능 리스크

확인한 코드:

- `backend/scripts/build_bom_graph_html.py:66`
  - `db.query(Item).all()`로 전체 품목을 조회합니다.
- `backend/app/services/bom.py:20-27`
  - `build_bom_cache(db)`도 전체 BOM 행을 `db.query(BOM).all()`로 읽습니다.

판단:

- `BOM` 전체 캐시는 생산 가능 수량처럼 전체 BOM을 다루는 API에서는 어느 정도 받아들일 수 있지만, 그래프 HTML 생성 스크립트는 `model_pf_pins` 기준 대표 PF만 출력합니다.
- 따라서 대표 PF에서 도달 가능한 BOM edge와 품목만 조회하는 root-limited 캐시가 더 맞습니다.
- 특히 운영 스케줄러에서 HTML을 주기 생성한다면 `Item.all()`은 제거하는 게 맞습니다.

개선 방향:

- `model_pf_pins`에서 루트 PF를 먼저 읽습니다.
- 각 PF 루트에서 BFS/DFS로 BOM edge를 따라가며 필요한 `item_id` 집합만 수집합니다.
- `Item`은 `Item.item_id.in_(needed_ids)`로 조회합니다.
- BOM도 전체 로드 대신 루트에서 도달 가능한 parent만 단계별 bulk 조회합니다.

### 2.2 `build_bom_graph_html.py` BOM 수량 누락

확인한 코드:

- `backend/scripts/build_bom_graph_html.py:34-45`
  - `build_tree()`에서 `_qty`를 읽지만 사용하지 않습니다.
- 기존 백엔드 트리 API는 이미 `required_quantity`를 들고 있습니다.
  - `backend/app/routers/bom.py`의 `_build_tree_cached()`는 child 수량을 누적해 `required_quantity`를 계산합니다.

판단:

- 동환님 말대로 수량 없는 BOM 그래프는 현업 입장에서는 "참고용 관계도"에 가깝습니다.
- BOM 트리는 최소한 "부모 1개당 필요 수량"과 "루트 1개 기준 누적 필요 수량"을 같이 보여줘야 합니다.

개선 방향:

노드 데이터에 아래 필드를 추가합니다.

```json
{
  "item_id": "...",
  "code": "3-AF-0001",
  "name": "품목명",
  "type": "AF",
  "edge_quantity": 2,
  "required_quantity": 6,
  "unit": "EA",
  "available_quantity": 120,
  "warehouse_available": 90,
  "min_stock": 200,
  "shortage_to_required": 0,
  "children": []
}
```

표시 규칙:

- 카드 요약: `코드`, `품명`, `필요 6 EA`, `가용 120 EA`
- tooltip 또는 상세 패널: `부모 1개당 2 EA`, `루트 1개 기준 6 EA`, `창고가용 90 EA`, `안전재고 200 EA`
- 부족 상태:
  - `required_quantity > available_quantity`: 계획 기준 부족
  - `required_quantity > warehouse_available`: 실제 창고 차감 기준 부족
  - `available_quantity < min_stock`: 안전재고 이하

### 2.3 정전개/역전개 로직 혼선

확인한 코드:

- `backend/scripts/build_bom_graph_html.py:270`
  - `applyHL(d)`에서 클릭 노드의 type에 따라 raw면 ancestors, 아니면 descendants를 강조합니다.
  - 중간재(`A`)는 같은 부서의 일부 ancestor까지 추가합니다.

판단:

- 현재 로직은 개발자 관점의 "유용해 보이는 강조"이지만, 제조 도메인에서는 정전개와 역전개를 분리해야 합니다.
- 한 노드 클릭에서 위/아래가 섞이면 사용자는 지금 보고 있는 것이 "이 제품의 하위 소요 자재"인지 "이 자재의 상위 사용처"인지 헷갈릴 수 있습니다.

개선 방향:

- UI 상단에 탐색 모드를 둡니다.
  - `정전개`: 선택 노드 아래 descendants만 강조
  - `역전개`: 선택 노드 위 ancestors만 강조
  - `직접 연결`: parent/children 1단계만 강조
- 기본값은 `정전개`로 둡니다.
- 역전개를 제대로 하려면 현재 tree 내부 ancestors만으로는 부족할 수 있습니다. 하나의 대표 PF 트리 안에서는 ancestors로 충분하지만, "이 자재가 다른 PF/AF에도 쓰이는지"까지 보려면 reverse BOM cache가 필요합니다.
- 1차 구현은 "현재 모델 그래프 안에서의 역전개"로 제한하고, 전체 품목 where-used 분석은 후속 작업으로 분리하는 것이 안전합니다.

### 2.4 `foreignObject`와 대량 노드 UI 리스크

확인한 코드:

- `backend/scripts/build_bom_graph_html.py:8`
  - 파일 설명에 `foreignObject` 기반 큰 노드를 명시합니다.
- `backend/scripts/build_bom_graph_html.py:299`
  - 실제 노드는 `foreignObject` + HTML div 카드로 렌더링됩니다.
- `backend/scripts/build_bom_graph_html.py:312`
  - `fit()`은 전체 그래프 bounds 기준으로 축소합니다.

판단:

- 노드가 적을 때는 `foreignObject` 카드가 읽기 좋지만, 수백~수천 노드에서는 DOM 비용이 커질 수 있습니다.
- 전체 화면 맞춤은 노드 수가 많을수록 scale이 과하게 작아져 텍스트가 실처럼 보입니다. 이건 단순 버그가 아니라 "전체를 한 화면에 다 넣는 UX" 자체의 한계입니다.

개선 방향:

- 노드 수가 500개 이상이면 자동으로 `요약 모드`를 켭니다.
- 요약 모드에서는 `foreignObject`를 쓰지 않고 SVG `<rect>`, `<text>`, `<title>` 중심으로 렌더링합니다.
- 긴 품명은 카드 안에 모두 넣지 않고 선택 패널에서 보여줍니다.
- `fit` 버튼을 세분화합니다.
  - `전체 보기`: 전체 bounds에 맞춤
  - `선택 주변`: 선택 노드 주변 N단계에 맞춤
  - `현재 공정`: 선택 노드의 process band에 맞춤
- 공백 밴드는 데이터가 없는 공정이면 높이를 줄이고, 완전히 숨기는 옵션을 제공합니다.

### 2.5 하드코딩된 모델/공정/범례

확인한 코드:

- `backend/scripts/build_bom_graph_html.py:27`
  - `MODEL_LABEL` 하드코딩
- `backend/scripts/build_bom_graph_html.py:160`
  - `LEVELS` 하드코딩
- `backend/scripts/build_bom_graph_html.py:173`
  - `LEGEND` 하드코딩

기존 마스터:

- `backend/app/models/code.py:20`
  - `ProductSymbol`
- `backend/app/models/code.py:34-40`
  - `ProcessType`, `stage_order`
- `backend/app/routers/codes.py:30-32`
  - `/api/codes/symbols`
- `backend/app/routers/codes.py:90-92`
  - `/api/codes/process-types`

판단:

- 동환님 지적처럼 코드 수정 없이 모델/공정이 늘어나야 하는 방향이 맞습니다.
- 다만 `process_type_mst` 같은 새 기준 테이블을 만들기보다, 현재 코드베이스에 이미 있는 `process_types`, `product_symbols`를 먼저 쓰는 편이 안전합니다.

개선 방향:

- 모델명은 `ProductSymbol.symbol -> model_name`에서 읽습니다.
- 공정 밴드는 `ProcessType.stage_order`, `code`, `description`에서 읽습니다.
- 색상은 1차로 prefix별 기본 palette를 코드에 두되, 설명/순서/라벨은 DB에서 가져옵니다.
- 향후 색상까지 마스터화하려면 `process_types.color_hex` 같은 컬럼 추가를 별도 migration으로 검토합니다. 이번 작업의 필수 범위는 아닙니다.

### 2.6 `inspect_bom_depth.py` N+1 쿼리

확인한 코드:

- `backend/scripts/inspect_bom_depth.py:58`
  - BFS while loop
- `backend/scripts/inspect_bom_depth.py:67-70`
  - 각 item마다 `items` + `inventory` 조회
- `backend/scripts/inspect_bom_depth.py:80`
  - 각 item마다 `bom` 자식 조회

판단:

- 품목/BOM이 수만 건이면 분석 스크립트가 느려지는 구조가 맞습니다.
- 로컬에서는 문제 없어 보여도 운영 DB dump나 개발 분석 DB에서는 체감 성능이 크게 떨어질 수 있습니다.

개선 방향:

- 분석 시작 시 필요한 PF 루트를 결정합니다.
- BOM edge는 root-limited bulk BFS로 수집합니다.
- `items`, `inventory`, `inventory_locations`, `process_types`를 bulk 조회합니다.
- 루프 안에서는 DB를 보지 않고 dict만 참조합니다.
- 가능하면 쿼리 수를 루트 수와 무관하게 제한합니다.

목표 쿼리 구조:

1. 대표 PF 루트 조회
2. BOM edge bulk 조회
3. 필요한 Item bulk 조회
4. Inventory bulk 조회
5. InventoryLocation group-by 조회
6. ProcessType 조회

### 2.7 immediate/maximum, 안전재고, 가용재고 관계

기존 구현 기준:

- `backend/app/services/production_capacity.py:18-19`
  - 생산 가능 수량은 `StockFigures.available` 기준이며, 실제 backflush 검증은 `warehouse_available`과 구분한다고 설명합니다.
- `backend/app/services/production_capacity.py:40`
  - legacy immediate cutoff는 `_NF_STAGE_ORDER = 60`
- `backend/app/services/production_capacity.py:145`
  - immediate mode에서 stage가 NF 미만이면 더 내려가지 않습니다.
- `backend/app/services/stock_math.py:13-14`
  - `available = warehouse + production - pending`
  - `warehouse_available = warehouse - pending`
- `backend/app/services/stock_math.py:50-57`
  - 두 값이 property로 분리되어 있습니다.

판단:

- 동환님이 말한 "단순 stage 분포만으로는 immediate vs maximum 차이를 설명하기 어렵다"는 지적은 맞습니다.
- 다만 현재 production capacity의 `immediate/maximum`은 이미 stage cutoff와 `available` 기준으로 정의되어 있습니다. 따라서 inspect 스크립트는 이 정의를 그대로 따라가면서, 왜 부족한지 설명하는 분석값을 더 붙이는 방향이 맞습니다.
- 안전재고는 `items.min_stock`으로 이미 존재합니다. 실제 차단 조건인지, 경고 조건인지는 화면/업무 정책에 따라 다르므로 문서와 출력에서 구분해야 합니다.

개선 방향:

- `inspect_bom_depth.py`는 각 노드에 다음 값을 출력합니다.
  - `required_qty`: 루트 1개 기준 누적 소요량
  - `available`: 계획/대응 기준 가용
  - `warehouse_available`: 실제 창고 차감 가능량
  - `min_stock`: 안전재고
  - `shortage_to_required`: `max(required_qty - available, 0)`
  - `warehouse_shortage_to_required`: `max(required_qty - warehouse_available, 0)`
  - `below_min_stock`: `available < min_stock`
- "차단"과 "경고"를 분리합니다.
  - 소요량 부족: 생산/출고 가능 수량 계산의 병목
  - 안전재고 이하: 추가 요청/발주/관리 경고

## 3. 구현 단계 제안

### 1단계: 백엔드 안정화와 분석 속도 개선

목표:

- 운영 DB 규모에서도 스크립트가 안정적으로 실행되게 합니다.
- `Item.all()`과 BFS 내부 단건 조회를 제거합니다.

변경 대상:

- `backend/scripts/build_bom_graph_html.py`
- `backend/scripts/inspect_bom_depth.py`
- 필요 시 공통 helper 파일 `backend/scripts/bom_graph_data.py` 신설

작업:

1. root-limited BOM cache helper 작성
2. PF pin 또는 대표 PF fallback 로직 정리
3. reachable `item_id` 수집
4. `Item`, `Inventory`, `InventoryLocation`, `ProcessType`, `ProductSymbol` bulk 조회
5. 기존 출력과 그래프가 동일 루트 기준으로 생성되는지 확인

완료 기준:

- `build_bom_graph_html.py`에 `db.query(Item).all()`이 남지 않습니다.
- `inspect_bom_depth.py` BFS 루프 안에 `cur.execute(...)`가 남지 않습니다.
- 대표 PF 5~6종 기준 HTML 생성이 정상 완료됩니다.

### 2단계: BOM 수량과 가용재고 분석 바인딩

목표:

- 그래프와 분석 출력이 단순 관계도가 아니라 "소요량이 있는 BOM"으로 읽히게 합니다.
- immediate/maximum 차이를 stage와 재고 부족 관점에서 설명합니다.

변경 대상:

- `backend/scripts/build_bom_graph_html.py`
- `backend/scripts/inspect_bom_depth.py`
- 테스트 파일 추가 또는 보강

작업:

1. 트리 노드에 `edge_quantity`, `required_quantity` 추가
2. 재고 계산값 `available`, `warehouse_available`, `min_stock` 추가
3. 부족 계산값 `shortage_to_required`, `warehouse_shortage_to_required`, `below_min_stock` 추가
4. HTML 카드/tooltip/선택 패널에 수량과 부족 상태 표시
5. inspect 출력에 병목 후보와 부족 원인 요약 추가

완료 기준:

- 부모 1개당 수량과 루트 기준 누적 수량이 구분됩니다.
- 재고 부족과 안전재고 이하가 같은 의미로 섞이지 않습니다.
- 스크립트 출력만 보고도 "왜 immediate와 maximum이 같은지/다른지"를 설명할 수 있습니다.

### 3단계: 정전개/역전개 UX 분리

목표:

- 현업이 보는 BOM 가계도의 두 목적을 명확히 분리합니다.

변경 대상:

- `backend/scripts/build_bom_graph_html.py`의 HTML/JS template

작업:

1. 상단 toolbar에 탐색 모드 추가
2. `정전개` 모드: descendants 강조
3. `역전개` 모드: ancestors 강조
4. `직접 연결` 모드: parent/children 1단계 강조
5. 선택 패널 문구를 모드별로 변경

완료 기준:

- 중간재를 클릭해도 위/아래가 동시에 애매하게 강조되지 않습니다.
- 사용자가 현재 모드를 UI에서 항상 확인할 수 있습니다.

### 4단계: 대량 노드 렌더링 최적화

목표:

- 500개 이상 노드에서도 화면 맞춤 후 글자가 실처럼 보이는 문제와 렌더링 끊김을 줄입니다.

변경 대상:

- `backend/scripts/build_bom_graph_html.py`의 HTML/JS/CSS template

작업:

1. 노드 수가 500개 이상이면 자동 요약 모드
2. 요약 모드에서 `foreignObject` 대신 SVG primitive 사용
3. 긴 품명과 상세 수량은 선택 패널로 이동
4. `fit`을 전체/선택 주변/현재 공정으로 분리
5. 빈 공정 밴드 높이 축소 또는 숨김 토글

완료 기준:

- 대량 노드에서 기본 조작이 끊기지 않습니다.
- 전체 맞춤은 "구조 파악용", 상세 읽기는 "선택 주변/패널"로 역할이 분리됩니다.

### 5단계: 마스터 정보 동적화

목표:

- 신제품/공정 추가 시 HTML 생성 스크립트 소스 수정 없이 반영되게 합니다.

변경 대상:

- `backend/scripts/build_bom_graph_html.py`
- 필요 시 `backend/scripts/bom_graph_data.py`

작업:

1. `ProductSymbol`에서 모델 라벨 조회
2. `ProcessType`에서 공정 code/order/description 조회
3. `LEVELS`를 DB 기반으로 생성
4. `MODEL_LABEL` 제거
5. `LEGEND` 라벨은 DB 기반, 색상은 prefix palette 기반으로 1차 정리

완료 기준:

- `ProductSymbol`에 새 모델이 추가되면 그래프 모델명에도 자동 반영됩니다.
- `ProcessType`의 설명/순서 변경이 밴드 라벨/순서에 반영됩니다.

## 4. 테스트 계획

### 단위 테스트

추가 후보:

- `backend/tests/scripts/test_bom_graph_data.py`

검증 항목:

- PF 루트에서 도달 가능한 item만 수집하는지
- cycle이 있어도 무한 순회하지 않는지
- `edge_quantity`와 `required_quantity`가 누적 곱으로 계산되는지
- `available`, `warehouse_available`, `min_stock`이 구분되는지
- 안전재고 이하와 소요량 부족이 별도 flag로 계산되는지

### 기존 회귀 테스트

실행 후보:

```powershell
cd backend
pytest tests/services/test_bom.py tests/routers/test_bom_smoke.py tests/services/test_production_capacity.py tests/routers/test_capacity.py -q
```

목적:

- 기존 BOM 전개, where-used, production capacity 정의가 깨지지 않는지 확인합니다.

### 스크립트 smoke test

실행 후보:

```powershell
cd backend
python scripts/inspect_bom_depth.py
python scripts/build_bom_graph_html.py
```

목적:

- 실제 개발 DB 기준으로 분석과 HTML 생성이 완료되는지 확인합니다.
- 생성 파일 `backend/scripts/bom_family_graph.html`을 열어 정전개/역전개와 대량 노드 모드를 확인합니다.

## 5. 동환님 답변 반영 구현 결정

아래 내용은 동환님 답변을 반영해 1차 구현 기준으로 고정합니다.

1. 정전개/역전개 용어
   - UI 상단 토글은 `하위 소요 자재 (정전개)`, `상위 사용처 (역전개)`처럼 직관 표현과 한자어를 함께 표기합니다.
   - 현업 사용자 숙련도와 연령대가 섞여 있으므로, 한쪽 용어만 쓰지 않습니다.
   - 선택 패널 문구도 같은 기준을 따릅니다.
     - 정전개: `선택 품목을 만들기 위해 필요한 하위 소요 자재`
     - 역전개: `선택 품목이 사용되는 상위 사용처`

2. 재고 기준
   - 기본 뷰의 주 기준은 계획 가용량인 `available = warehouse + production - pending`으로 둡니다.
   - 단, 실제 창고 차감 가능량인 `warehouse_available = warehouse - pending`을 카드 하단 또는 tooltip에 반드시 병기합니다.
   - 이유: 그래프의 주 목적은 생산 가용량 시뮬레이션이지만, 창고 재고 부족으로 공정이 잠기는 상황을 디버깅하려면 두 값이 모두 보여야 합니다.
   - 표시 예시:
     - 카드 본문: `계획가용 120 EA`
     - 카드 하단/tooltip: `창고가용 90 EA`

3. 안전재고 표시 규칙
   - `min_stock` 이하는 차단 조건이 아니라 경고 조건으로 처리합니다.
   - 안전재고는 생산 중단 조건보다는 구매팀/생산관리팀에 발주 또는 추가 생산 필요성을 알려주는 관리 지표로 봅니다.
   - 시각 표현은 소요량 부족과 안전재고 경고를 분리합니다.
     - 빨강: 누적 소요량 대비 계획가용 또는 창고가용 부족
     - 노랑: 안전재고 이하

4. 대량 노드 UX 기준
   - 노드 500개 이상이면 자동 요약 모드로 전환합니다.
   - 최적화의 중심은 전체 트리 한 화면 맞춤이 아니라 `선택 노드 주변 N단계 맞춤`입니다.
   - 현업 기본 흐름은 선택 노드 주변 상세 확인이고, 전체 트리 구조는 대형 이슈나 품절 사태 때 맥락 확인용으로 사용합니다.
   - 따라서 fit 기능 우선순위는 다음과 같습니다.
     1. 선택 주변 N단계 맞춤
     2. 현재 공정 밴드 맞춤
     3. 전체 보기

5. 역전개 범위
   - 1차 구현은 현재 선택한 모델 그래프 안에서의 역전개로 제한합니다.
   - 전사 전체 where-used 분석은 쿼리 스케일과 UI 복잡도가 커지므로 이번 범위에서 제외합니다.
   - 특정 자재가 모든 제품/PF/AF에서 어디 쓰이는지 보는 기능은 추후 별도 탭 또는 메뉴로 분리합니다.

6. 마스터 색상 관리
   - 1차 구현은 prefix별 고정 palette를 사용합니다.
   - 색상 DB 마스터화는 후속 마이그레이션으로 미룹니다.
   - 공정 색상 하나 때문에 DB 스키마 변경과 마이그레이션을 추가하는 것은 1차 개선 범위 대비 비용이 큽니다.

## 6. 제안 실행 순서

이번 작업은 한 번에 모두 넣기보다 두 번으로 나누는 편이 안전합니다.

1차 PR 또는 커밋:

- `Item.all()` 제거
- `inspect_bom_depth.py` N+1 제거
- BOM 수량/재고 분석값 추가
- 테스트 추가

2차 PR 또는 커밋:

- 정전개/역전개 UI 모드
- 대량 노드 렌더링 최적화
- 모델/공정 마스터 동적화

이유:

- 1차는 운영 안정성과 계산 정합성입니다.
- 2차는 UI/UX와 마스터 동적화입니다.
- 둘을 한 번에 섞으면 성능 문제를 고친 것인지, UI 렌더링 변경 때문에 달라진 것인지 검증이 어려워집니다.

## 7. 구현 시 주의사항

- `build_bom_cache(db)` 자체를 바로 바꾸면 production capacity 등 기존 기능 영향이 큽니다. 처음에는 스크립트 전용 root-limited helper로 분리하는 것이 안전합니다.
- `immediate/maximum` 정의는 이미 `production_capacity.py`에 있으므로 새 정의를 만들지 말고 기존 정의를 기준으로 설명 값을 붙이는 방식이 좋습니다.
- `foreignObject` 제거는 시각 변화가 크므로, 노드 수 기준 자동 요약 모드로 점진 적용하는 편이 안전합니다.
- `ProductSymbol`, `ProcessType`은 현재 마스터가 있으므로 새 마스터 테이블을 만들기 전에 반드시 기존 테이블 재사용을 먼저 검토합니다.
- 이번 문서는 검토용입니다. 실제 코드 수정 전에는 동환님 답변을 받아 1차 범위를 확정하는 것이 좋습니다.
