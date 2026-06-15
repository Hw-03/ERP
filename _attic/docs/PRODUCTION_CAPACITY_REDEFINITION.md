# AF 기준 생산 가능 수량 재정의

이 문서는 생산 가능 수량 기능을 다시 정의하기 위한 기준 문서다. 코드 수정 내역이 아니라, 이후 백엔드/프론트엔드 수정 시 Claude/Codex/사람이 같은 전제를 공유하기 위한 컨텍스트와 구현 방향을 담는다.

현재 위치는 `_attic/docs/`이지만, 내용은 과거 기록이 아니라 현재 논의된 새 기준이다. 실제 구현 전까지는 이 문서를 기준 초안으로 본다.

## 왜 다시 정의하는가

현재 생산 가능 수량은 `backend/app/routers/production.py`의 `get_production_capacity()`에서 계산한다. 이 함수는 BOM 트리 최상위 품목 중 `PF`를 대상으로 잡고, 각 PF의 `immediate`와 `maximum`을 계산한 뒤 전체 합계를 만든다.

프론트엔드는 이 응답을 `ProductionCapacity` 타입으로 받아 대시보드와 상세 모달에 표시한다. 현재 주요 필드는 다음과 같다.

- `immediate`: 중간 공정 재고를 활용한 즉시 생산 가능 수량
- `maximum`: 하위 자재까지 모두 투입했을 때의 이론상 최대 생산 가능 수량
- `top_items`: 최상위 PF별 계산 결과
- `representative_items`: 모델별 대표 PF 표시용 결과

이 구조는 시연과 초기 판단에는 쓸 수 있지만, 실제 업무 의미와 어긋나는 부분이 있다.

- 같은 모델이어도 옵션, 출고처, 스펙 차이 때문에 여러 `PF`가 존재한다.
- `PF`를 그대로 합산하면 같은 모델의 생산 여력이 중복 계산될 수 있다.
- `representative_items`는 표시용 우회일 뿐, 중복 계산 문제를 근본적으로 해결하지 않는다.
- 주문 대응 관점에서 중요한 기준점은 포장 완료품인 `PF`보다 완제품 조립 기준인 `AF`에 더 가깝다.
- `AF`가 충분해도 `PR/PA/PF` 전환 구간 자재가 부족하면 실제 출하 준비 수량은 줄어든다.

따라서 생산 가능 수량 기능은 `PF` 중심이 아니라 `AF` 중심으로 재정의한다.

## 기준 컨텍스트

품목코드 기준에서 `AF`는 조립 완제품 계층이다. `PF`는 출하/포장 완료 계층이며, 주문 사양, 출고처, 옵션에 따라 같은 모델 안에서도 여러 품목이 생길 수 있다.

현재 BOM 검토 기준 모델은 `ADX4000W`다. 다른 제품은 BOM이 아직 완성되지 않았을 수 있으므로, 새 정의와 계산 검증은 우선 `ADX4000W`를 기준으로 한다.

`backend/scripts/bom_family_graph.html` 같은 BOM 가계도 HTML은 이 기능을 눈으로 검토하기 위한 보조 도구다. 특히 `AF` 아래 어디까지를 빠른 조립 범위로 볼지 확인하는 데 사용한다.

## 최종 용어

앞으로 화면과 API에서 사용할 업무 용어는 다음 세 가지로 잡는다.

| 용어 | 의미 | BOM 기준 |
| --- | --- | --- |
| 출하 준비 가능 | 이미 확보된 `AF`를 `PR -> PA -> PF` 구간으로 마무리해 출하 사양까지 준비할 수 있는 수량 | AF 상위 출하/포장 전환 구간 |
| 빠른 조립 가능 | `AF`의 직계 BOM 자식 전체만 보고 빠르게 AF를 만들 수 있는 수량 | AF 바로 아래 1레벨 |
| 총 생산 가능 | `AF` 아래 전체 BOM을 끝까지 펼쳐 처음 공정부터 만들 수 있는 수량 | AF 하위 전체 재귀 |

기존의 `immediate`와 `maximum`은 새 용어와 1:1로 대응시키지 않는다. 전환 기간에는 구버전 필드로 유지하되, 새 구현에서는 명확한 필드명을 병행 추가한다.

권장 새 필드명은 다음과 같다.

- `ship_ready`: 출하 준비 가능
- `fast_assembly`: 빠른 조립 가능
- `total_production`: 총 생산 가능

## 핵심 원칙

기준점은 `PF`가 아니라 `AF`다. 메인 대시보드의 생산 가능 수량은 AF 단위로 계산하고, PF 변형은 상세 화면이나 주문 맥락에서만 다룬다.

`빠른 조립 가능`은 공정코드 묶음으로 판단하지 않는다. 기준은 실제 BOM에서 `AF` 바로 아래에 붙어 있는지 여부다.

따라서 AF 직계 자식이라면 코드가 `AA`, `AR`, `NF`, `PR` 중 무엇이든 빠른 조립 가능 계산에 포함한다. 현재 데이터에서도 `NF`는 AF 직계로 잡히는 경우가 있으므로, `NF`를 제외하면 실제 BOM 의도와 달라질 수 있다.

사람이 완성한 BOM을 최종 진실원으로 본다. 별도의 대표 모델 우회 규칙이나 코드군 추론은 BOM이 미완성일 때의 보조 정보로만 사용한다.

BOM이 미완성인 모델은 생산 가능 수량을 0처럼 조용히 보여주지 않는다. 사용자가 데이터 미완성과 실제 생산 불가를 구분할 수 있도록 `incomplete` 같은 상태를 드러낸다.

## 향후 API 구조 초안

기존 `/api/production/capacity` 응답을 바로 깨지 말고, 새 AF 기준 구조를 병행 추가한다.

```ts
interface ProductionCapacityV2 {
  basis: "AF";
  status: "no_target" | "bom_not_registered" | "incomplete" | "not_producible" | "producible";
  summary: {
    ship_ready: number;
    fast_assembly: number;
    total_production: number;
  };
  af_items: ProductionCapacityAfItem[];
  pf_variants: ProductionCapacityPfVariant[];

  // Legacy fields kept only during migration.
  immediate?: number;
  maximum?: number;
  representative_items?: ProductionCapacityItem[];
}

interface ProductionCapacityAfItem {
  af_item_id: string;
  af_code: string | null;
  af_name: string;
  model_symbol: string | null;
  ship_ready: number;
  fast_assembly: number;
  total_production: number;
  ship_ready_limiting_item: string | null;
  fast_assembly_limiting_item: string | null;
  total_production_limiting_item: string | null;
  bom_status: "complete" | "incomplete";
}

interface ProductionCapacityPfVariant {
  pf_item_id: string;
  pf_code: string | null;
  pf_name: string;
  model_symbol: string | null;
  af_item_id: string | null;
  ship_ready: number;
  limiting_item: string | null;
  bom_status: "complete" | "incomplete";
}
```

위 구조는 최종 API 스펙이 아니라 구현 방향이다. 핵심은 `summary`와 `af_items`가 AF 기준이라는 점, `pf_variants`는 주문/출하 상세용이라는 점이다.

## 계산 방향

`출하 준비 가능`은 AF에서 PF로 올라가는 구간을 본다. 이미 확보된 AF 수량이 출발점이며, PR/PA/PF 구간에서 필요한 자재나 공정 품목이 병목이면 그 수량만큼 제한된다.

`빠른 조립 가능`은 AF의 직계 BOM 자식만 본다. 자식의 하위 BOM까지 더 내려가지 않는다. 이 숫자는 “현장에 준비된 중간 조립품과 핵심 모듈을 모아 빠르게 AF를 만들 수 있는가”를 나타낸다.

`총 생산 가능`은 AF 아래 전체 BOM을 재귀로 펼친다. 원자재와 하위 공정까지 모두 포함한 이론상 생산 여력이다.

세 수량은 모두 병목 품목을 함께 제공해야 한다. 숫자만 보여주면 사용자가 왜 그 수량이 나왔는지 알 수 없고, 기존 기능의 혼란이 반복된다.

## 화면 방향

메인 대시보드는 AF 기준 3개 수량을 보여준다.

- 출하 준비 가능
- 빠른 조립 가능
- 총 생산 가능

PF별 변형, 옵션, 출고처 차이는 메인 카드에서 합산하지 않는다. 특정 PF 주문이 들어왔을 때 상세 화면에서 “이 PF는 어느 AF에서 출발하며, 출하 준비 가능 수량은 얼마인가”를 보여준다.

상세 모달은 다음 순서가 좋다.

1. AF별 3개 수량 요약
2. 각 수량의 병목 품목
3. 해당 AF에 연결된 PF 변형 목록
4. BOM 미완성 여부

## 검증 기준

첫 검증 대상은 `ADX4000W`다.

확인해야 할 시나리오는 다음과 같다.

- 같은 AF에 여러 PF가 연결되어도 메인 생산 가능 수량이 중복 합산되지 않는다.
- AF 재고는 충분하지만 PR/PA/PF 전환 구간이 부족하면 `출하 준비 가능`이 제한된다.
- AF 직계 자식인 NF가 부족하면 `빠른 조립 가능`이 제한된다.
- AF 직계 자식은 충분하지만 더 아래 하위 자재가 부족하면 `총 생산 가능`만 제한된다.
- BOM 미완성 모델은 실제 생산 불가와 구분되어 표시된다.
- 기존 `immediate`, `maximum`, `representative_items`는 전환 기간 동안만 구버전 호환 필드로 취급된다.

## 결정된 사항

- 기준 품목은 `AF`다.
- 명칭은 `출하 준비 가능`, `빠른 조립 가능`, `총 생산 가능`으로 고정한다.
- `빠른 조립 가능`은 AF 직계 BOM 자식 전체를 대상으로 한다.
- `NF`도 AF 직계라면 포함한다.
- `PF` 변형은 메인 생산 가능 수량 계산의 중심이 아니라 상세/주문 맥락에서 다룬다.
- BOM은 사람이 완성한다고 가정하고, 완성된 BOM을 최종 기준으로 삼는다.
