# bomSync.ts

## 이 파일은 뭐예요?
입출고 카트(bundles) 내 BOM 비례 동기화를 수행하는 순수 함수 모음입니다. 라인 체크 토글, 수량 변경, 묶음 기준수량 변경 시 부모→자식 비례 재계산 알고리즘이 부수효과 없이 정의되어 있습니다.

## 언제 보나요?
- 생산(produce)에서 상위 품목 수량을 바꾸면 하위 자재가 자동으로 비례 변경되는 동작을 추적할 때
- 창고 입출고에서 사용자가 직접 편집한 하위 라인(`edited=true`)이 부모 변경 시 보존되는지 확인할 때
- 체크 해제 시 `exclusion_note` 설정 로직을 파악할 때

## 중요한 내용
- `applyToggleLine(bundles, bundleId, lineId, subType, getAvailable)` — 부모 토글 시 활성 bom_auto 자식 함께 토글
- `applyLineQuantityChange(bundles, bundleId, lineId, quantity, shortage, subType, getAvailable)` — 부모 수량 변경 시 자식 비례 cascade. `forced`(produce/disassemble)이면 edited 무시, 그 외엔 편집된 자식 보존
- `applyBundleQuantityChange(bundles, bundleId, newQty, subType, getAvailable)` — 부모 라인 없는 BOM 묶음(창고 입출고) 전용 기준수량 변경

## 위험도
🔴 높음 — 재고 수식 핵심 로직. 비례 계산·bom_expected ratio·edited 보존 조건을 잘못 수정하면 카트 수량이 조용히 틀려져 잘못된 재고 반영으로 이어질 수 있음.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 이 함수들을 `setBundles` updater로 호출하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — `isBomForced`, `exclusionNoteFor` 소스
