/**
 * preselectedItem 자동 적용 effect 추출.
 *
 * - 일반 품목: 자동 카트 추가 (addItem 호출)
 * - BOM 부모: 자동 추가 안 함, picker 에서 row 만 하이라이트
 * - workType / subType / 부서 변경 시 bundles 가 reset 되므로 같은 preselectedItem
 *   이라도 재적용. 가드 key 에 네 필드를 모두 포함.
 * - process workType + 방향 미선택 상태에서는 자동 적용 보류
 * - bomParents 가 빈 set 인 동안(=BOM 데이터 아직 로딩 중)에는 effect 보류
 *   → S1 시연 검증 race 결함 대응
 *
 * 호출 측은 IoComposeView 의 addItem / setHighlightItemId 를 그대로 주입.
 * 단위 테스트에서는 mock 함수로 분기 검증 가능.
 */
import { useEffect, useRef } from "react";
import type { Item, IoWorkType } from "@/lib/api";

export type UseIoPreselectArgs = {
  preselectedItem: Item | null | undefined;
  bomParents: Set<string>;
  /**
   * BOM 적재가 끝났는지 여부. false 인 동안에는 effect 가 어떤 분기도 실행하지 않는다.
   * S1 시연 검증에서 발견된 race: bomParents 가 빈 set(=초기값) 상태에서 effect 가 먼저 돌면
   * BOM 부모도 일반 품목으로 오인되어 자동 추가됨.
   */
  bomParentsLoaded: boolean;
  workType: IoWorkType;
  subType: string;
  fromDepartment: string | null;
  toDepartment: string | null;
  deptIoDirection: "in" | "out" | null;
  addItem: (item: Item) => Promise<void> | void;
  setHighlightItemId: (id: string | null) => void;
};

export function useIoPreselect(args: UseIoPreselectArgs): void {
  const {
    preselectedItem,
    bomParents,
    bomParentsLoaded,
    workType,
    subType,
    fromDepartment,
    toDepartment,
    deptIoDirection,
    addItem,
    setHighlightItemId,
  } = args;

  // 가드 key — workType/subType/부서 변경 시마다 bundles 가 reset 되므로 동일 preselect
  // 가 다시 적용되어야 함. (이전엔 workType 만 포함 — subType·부서 바꾸면 자동 카트 미반영 버그)
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!preselectedItem) return;
    // BOM 부모 set 이 아직 로딩 안 됨 — 보류 (S1 race 대응)
    if (!bomParentsLoaded) return;
    const handledKey = `${preselectedItem.item_id}__${workType}__${subType}__${fromDepartment ?? ""}__${toDepartment ?? ""}`;
    if (handledRef.current === handledKey) return;
    // process workType + 방향 미선택이면 자동 추가 보류 (Step 2에서 방향 선택 후 다시 진입해야 함)
    if (workType === "process" && deptIoDirection == null) return;
    handledRef.current = handledKey;
    if (bomParents.has(preselectedItem.item_id)) {
      // BOM 부모: 자동 카트 추가하지 않고 Step 3 picker 에서 해당 row 만 강조.
      // 낱개/BOM 선택은 사용자가 직접.
      setHighlightItemId(preselectedItem.item_id);
    } else {
      // 일반 품목: 기존 흐름대로 자동 카트 추가.
      setHighlightItemId(null);
      void addItem(preselectedItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedItem?.item_id, workType, subType, fromDepartment, toDepartment, deptIoDirection, bomParents, bomParentsLoaded]);
}
